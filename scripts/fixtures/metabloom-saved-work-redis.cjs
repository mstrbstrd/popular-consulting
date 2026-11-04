const { spawn, spawnSync } = require('node:child_process');
const { connect, createServer } = require('node:net');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const MAX_REPLY_BYTES = 16 * 1024 * 1024;
const INCOMPLETE = Symbol('incomplete RESP reply');

function parseReply(buffer, offset = 0, binaryHex = false) {
  const lineEnd = buffer.indexOf('\r\n', offset);
  if (lineEnd < 0) return INCOMPLETE;
  const type = String.fromCharCode(buffer[offset]);
  const line = buffer.toString('utf8', offset + 1, lineEnd);
  let next = lineEnd + 2;
  if (type === '+') return { value: line, next };
  if (type === '-') return { value: Object.assign(new Error(line), { redisReplyError: true }), next };
  if (type === ':') return { value: Number(line), next };
  const length = Number(line);
  if (!Number.isSafeInteger(length) || length < -1) throw new Error('Invalid fixture RESP length');
  if (length === -1) return { value: null, next };
  if (type === '$') {
    if (buffer.length < next + length + 2) return INCOMPLETE;
    if (buffer.toString('ascii', next + length, next + length + 2) !== '\r\n')
      throw new Error('Invalid fixture RESP bulk terminator');
    return { value: buffer.toString(binaryHex ? 'hex' : 'utf8', next, next + length), next: next + length + 2 };
  }
  if (type !== '*' || length > 20000) throw new Error('Unsupported fixture RESP reply');
  const values = [];
  for (let index = 0; index < length; index++) {
    const item = parseReply(buffer, next);
    if (item === INCOMPLETE) return INCOMPLETE;
    values.push(item.value);
    next = item.next;
  }
  return { value: values, next };
}

function respCommand(target, args, { signal } = {}) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const socket = connect(target);
    let settled = false;
    let bytes = Buffer.alloc(0);
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      socket.destroy();
      if (error) reject(error); else resolve(value);
    };
    const abort = () => finish(signal.reason || new DOMException('Aborted', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    socket.setTimeout(8000, () => finish(new Error('Disposable Redis command timed out')));
    socket.on('error', error => finish(error));
    socket.on('end', () => finish(new Error('Disposable Redis closed before replying')));
    socket.on('connect', () => {
      if (signal?.aborted) { abort(); return; }
      const parts = [Buffer.from(`*${args.length}\r\n`)];
      for (const value of args) {
        const data = Buffer.from(String(value));
        parts.push(Buffer.from(`$${data.length}\r\n`), data, Buffer.from('\r\n'));
      }
      socket.write(Buffer.concat(parts));
    });
    socket.on('data', chunk => {
      if (bytes.length + chunk.length > MAX_REPLY_BYTES) {
        finish(new Error('Disposable Redis reply exceeds fixture limit'));
        return;
      }
      bytes = Buffer.concat([bytes, chunk]);
      try {
        // DUMP is binary. Hex preserves byte-exact no-write snapshots instead
        // of silently replacing invalid UTF-8 bytes in serialized Redis data.
        const reply = parseReply(bytes, 0, args[0] === 'DUMP');
        if (reply !== INCOMPLETE) {
          if (reply.next !== bytes.length) throw new Error('Unexpected trailing fixture RESP data');
          finish(reply.value instanceof Error ? reply.value : null, reply.value);
        }
      } catch (error) { finish(error); }
    });
  });
}

function redisRuntime() {
  const external = process.env.METABLOOM_SAVED_WORK_TEST_REDIS_URL;
  if (external) {
    let url;
    try { url = new URL(external); } catch { /* Reject malformed fixture destinations below. */ }
    const valid = process.env.METABLOOM_SAVED_WORK_TEST_ALLOW_DISPOSABLE === '1'
      && external === external.trim() && url?.protocol === 'redis:'
      && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      && !url.username && !url.password && !url.search && !url.hash
      && ['', '/', '/0'].includes(url.pathname)
      && Number.isInteger(Number(url.port)) && Number(url.port) > 0 && Number(url.port) <= 65535;
    return { available: valid, required: true, external: true,
      target: valid ? { host: url.hostname === '[::1]' ? '::1' : '127.0.0.1', port: Number(url.port) } : null };
  }
  const binary = process.env.METABLOOM_SAVED_WORK_TEST_REDIS_SERVER || 'redis-server';
  const result = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 5000 });
  return { binary, available: result.status === 0, version: result.status === 0 ? result.stdout.trim() : '',
    required: process.env.METABLOOM_SAVED_WORK_TEST_REQUIRE_REDIS === '1' };
}

async function loopbackPort() {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => { if (error) reject(error); else resolve(port); });
    });
  });
}

// The default fixture owns its process and temporary directory. Explicit CI
// services must be opted-in loopback destinations; only registered test keys
// are cleaned up there. Neither mode accepts remote URLs or uses FLUSHALL.
async function startDisposableRedis(runtime = redisRuntime()) {
  if (!runtime.available) throw new Error('A local redis-server binary is required for native Saved work checks');
  if (runtime.external) {
    const keys = new Set();
    const command = (args, options) => respCommand(runtime.target, args, options);
    if (await command(['PING']) !== 'PONG') throw new Error('Disposable loopback Redis is unavailable');
    return { command, external: true, registerKey: key => keys.add(key),
      async dispose() { for (const key of keys) await command(['DEL', key]); } };
  }
  const directory = await mkdtemp(join(tmpdir(), 'orb-saved-redis-'));
  const port = await loopbackPort();
  const target = { host: '127.0.0.1', port };
  let child;
  let exited;
  let disposed = false;
  let output = '';
  const command = (args, options) => respCommand(target, args, options);
  const stop = async () => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    // SIGTERM persists this fixture's AOF. Only the owned child is signalled.
    child.kill('SIGTERM');
    let timer;
    const closed = await Promise.race([exited.then(() => true), new Promise(resolve => {
      timer = setTimeout(() => resolve(false), 5000);
    })]);
    clearTimeout(timer);
    if (!closed) {
      child.kill('SIGKILL');
      await exited;
      throw new Error('Disposable Redis did not shut down normally');
    }
  };
  const boot = async () => {
    output = '';
    child = spawn(runtime.binary, ['--bind', '127.0.0.1', '--port', String(port),
      '--dir', directory, '--dbfilename', 'fixture.rdb', '--appendonly', 'yes', '--appendfsync', 'always',
      '--save', '', '--daemonize', 'no', '--protected-mode', 'yes', '--maxmemory-policy', 'noeviction'],
    { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { output = (output + data.toString()).slice(-4000); });
    child.stderr.on('data', data => { output = (output + data.toString()).slice(-4000); });
    let spawnError;
    child.on('error', error => { spawnError = error; });
    exited = new Promise(resolve => child.once('close', resolve));
    for (let attempt = 0; attempt < 120; attempt++) {
      if (spawnError || child.exitCode !== null || child.signalCode !== null)
        throw new Error(`Disposable Redis failed to start: ${spawnError?.message || output}`);
      if (output.includes('Ready to accept connections')) {
        try {
          const info = await command(['INFO', 'server']);
          const pid = Number(info.match(/^process_id:(\d+)\r?$/m)?.[1]);
          if (pid !== child.pid) throw new Error('Disposable Redis process identity does not match');
          if (await command(['PING']) === 'PONG') return;
        } catch (error) {
          if (error.message.includes('identity does not match')) throw error;
          // The owned process may announce readiness immediately before listen.
        }
      }
      await delay(25);
    }
    throw new Error(`Disposable Redis startup timed out: ${output}`);
  };
  try { await boot(); }
  catch (error) {
    try { await stop(); } finally { await rm(directory, { recursive: true, force: true }); }
    throw error;
  }
  return {
    command,
    version: runtime.version,
    external: false,
    registerKey() { /* The fixture owns every key in its private process. */ },
    async restart() {
      if (disposed) throw new Error('Disposable Redis fixture is closed');
      await stop();
      await boot();
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      try { await stop(); } finally { await rm(directory, { recursive: true, force: true }); }
    },
  };
}

module.exports = { redisRuntime, startDisposableRedis };
