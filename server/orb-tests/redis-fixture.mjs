// Test-only RESP transport. Runs against an isolated local Redis service, never production.
import net from 'node:net';
function decode(buffer, offset = 0) {
  const end = buffer.indexOf('\r\n', offset); if (end === -1) return null;
  const kind = String.fromCharCode(buffer[offset]); const text = buffer.subarray(offset + 1, end).toString(); const next = end + 2;
  if (kind === '+') return { value: text, next };
  if (kind === '-') throw new Error(text);
  if (kind === ':') return { value: Number(text), next };
  if (kind === '$') {
    const length = Number(text); if (length === -1) return { value: null, next };
    if (buffer.length < next + length + 2) return null;
    return { value: buffer.subarray(next, next + length).toString(), next: next + length + 2 };
  }
  if (kind === '*') {
    if (Number(text) === -1) return { value: null, next };
    const values = []; let cursor = next;
    for (let i = 0; i < Number(text); i++) { const part = decode(buffer, cursor); if (!part) return null; values.push(part.value); cursor = part.next; }
    return { value: values, next: cursor };
  }
  throw new Error('Invalid Redis fixture response');
}
export function redisCommand(args) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: Number(process.env.ORB_TEST_REDIS_PORT) });
    let response = Buffer.alloc(0); const timer = setTimeout(() => { socket.destroy(); reject(new Error('Redis fixture timeout')); }, 4000);
    const stop = () => { clearTimeout(timer); socket.destroy(); };
    socket.on('error', error => { stop(); reject(error); });
    socket.on('connect', () => {
      const parts = [Buffer.from(`*${args.length}\r\n`)];
      for (const arg of args) { const body = Buffer.from(String(arg)); parts.push(Buffer.from(`$${body.length}\r\n`), body, Buffer.from('\r\n')); }
      socket.write(Buffer.concat(parts));
    });
    socket.on('data', chunk => {
      response = Buffer.concat([response, chunk]);
      try { const result = decode(response); if (result) { stop(); resolve(result.value); } }
      catch (error) { stop(); reject(error); }
    });
  });
}
export async function redisFetch(url, options) {
  const result = await redisCommand(JSON.parse(options.body));
  return new Response(JSON.stringify({ result }), { headers: { 'Content-Type': 'application/json' } });
}
