const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { randomBytes } = require('node:crypto');
const { createMetabloomResearchStore } = require('../server/metabloomResearchStore');
const { buildMetabloomResearchTemporalContext } = require('../server/metabloomResearchBrief');
const { MAX_METABLOOM_RESEARCH_REPORT_BYTES } = require('../src/components/metabloomResearchReport');

// Caller supplies an isolated Redis7 fixture. No URL/token, remote hosts,
// database flush or broad deletion is permitted by this test harness.
const fixturePort = () => {
  const raw = process.env.METABLOOM_QUOTA_TEST_REDIS_PORT;
  assert.ok(typeof raw === 'string' && /^[1-9]\d*$/.test(raw), 'Supply a disposable loopback Redis port');
  const port = Number(raw);
  assert.ok(Number.isInteger(port) && port <= 65535);
  return port;
};
function readResp(buffer) {
  const end = buffer.indexOf('\r\n');
  if (end < 0) return null;
  const type = String.fromCharCode(buffer[0]), text = buffer.toString('utf8', 1, end);
  if (type === '+') return { value: text, bytes: end + 2 };
  if (type === '-') throw new Error(`Redis fixture rejected command: ${text}`);
  assert.match(text, /^-?\d+$/);
  if (type === ':') return { value: Number(text), bytes: end + 2 };
  assert.equal(type, '$');
  const length = Number(text);
  assert.ok(Number.isSafeInteger(length) && length >= -1 && length <= 1100000);
  if (length === -1) return { value: null, bytes: end + 2 };
  if (buffer.length < end + 4 + length) return null;
  assert.equal(buffer.toString('ascii', end + 2 + length, end + 4 + length), '\r\n');
  return { value: buffer.toString('utf8', end + 2, end + 2 + length), bytes: end + 4 + length };
}
function redisCommand(port, args) {
  const parts = [Buffer.from(`*${args.length}\r\n`)];
  for (const arg of args) {
    const data = Buffer.from(String(arg));
    parts.push(Buffer.from(`$${data.length}\r\n`), data, Buffer.from('\r\n'));
  }
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let chunks = Buffer.alloc(0), settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); socket.destroy();
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('Redis fixture timed out')), 5000);
    socket.once('connect', () => socket.write(Buffer.concat(parts)));
    socket.once('error', error => finish(error));
    socket.once('end', () => finish(new Error('Redis fixture ended early')));
    socket.on('data', chunk => {
      try {
        assert.ok(chunks.length + chunk.length <= 1100000);
        chunks = Buffer.concat([chunks, chunk]);
        const result = readResp(chunks);
        if (result) { assert.equal(result.bytes, chunks.length); finish(null, result.value); }
      } catch (error) { finish(error); }
    });
  });
}
const hex = bytes => randomBytes(bytes).toString('hex');
function fixture(t) {
  const port = fixturePort(), identity = { owner: hex(32), subject: hex(32), scope: hex(32) };
  const prefix = `metabloom:{research-${identity.scope}}:`, owned = new Set();
  const command = async args => {
    assert.ok(args[1].startsWith(prefix), 'Only this fixture owns these keys');
    owned.add(args[1]);
    return redisCommand(port, args);
  };
  t.after(async () => { for (const key of owned) await redisCommand(port, ['DEL', key]); });
  return { identity, command, store: createMetabloomResearchStore({ command }),
    key: id => `${prefix}report:${id}`, briefKey: id => `${prefix}brief:${id}` };
}
const message = 'Compare the fictional research fixtures';
const sources = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, title: `Fictional source ${index + 1}`, url: `https://example.com/research/${index + 1}` }));
const report = { notes: 'Fictional original evidence: 0.12345678901234568, [] and Unicode 🌼 [9] [12].', sources };
const temporal = () => buildMetabloomResearchTemporalContext({ message, timeZone: 'America/Vancouver', now: Date.now() });

test('real Redis round-trips a full 1MiB immutable report and original source catalog', async t => {
  const f = fixture(t), temporalContext = temporal();
  const large = { notes: report.notes, sources };
  large.notes += 'x'.repeat(MAX_METABLOOM_RESEARCH_REPORT_BYTES - Buffer.byteLength(JSON.stringify(large)));
  assert.equal(Buffer.byteLength(JSON.stringify(large)), MAX_METABLOOM_RESEARCH_REPORT_BYTES);
  const research = await f.store.saveReport(f.identity, { message, report: large, temporalContext });
  const key = f.key(research.researchId), expires = await f.command(['PEXPIRETIME', key]);
  assert.deepEqual((await f.store.getReport(f.identity, research.researchId)).report, large);
  assert.equal(await f.command(['SET', key, 'replacement', 'EX', '3600', 'NX']), null);
  assert.deepEqual((await f.store.getReport(f.identity, research.researchId)).report, large);
  assert.equal(await f.command(['PEXPIRETIME', key]), expires, 'Reading or NX collision cannot extend retention');
});

test('real Redis keeps separately identified briefs within original expiry and session ownership', async t => {
  const f = fixture(t), temporalContext = temporal();
  const research = await f.store.saveReport(f.identity, { message, report, temporalContext });
  const brief = { version: 'metabloom-research-brief-v1', kind: temporalContext.kind, title: 'Fixture briefing', scope: 'Evidence is incomplete',
    ...Object.fromEntries(['asOf', 'timeZone', 'localDate', 'windowStart', 'windowEnd'].map(key => [key, temporalContext[key]])),
    coverage: { requestedCount: null, returnedCount: 0, status: 'unavailable', limitations: ['The fixture has no validated summary.'] },
    items: [], sourceDetails: [] };
  const originalExpiry = await f.command(['PEXPIRETIME', f.key(research.researchId)]);
  const child = await f.store.saveBrief(f.identity, research.researchId, brief);
  assert.equal(child.expiresAt, research.expiresAt);
  assert.deepEqual(await f.store.getBrief(f.identity, research.researchId, child.briefId), brief);
  assert.equal(await f.command(['PEXPIRETIME', f.briefKey(child.briefId)]), Date.parse(research.expiresAt));
  assert.equal(await f.command(['PEXPIRETIME', f.key(research.researchId)]), originalExpiry);
  const other = { ...f.identity, owner: hex(32) };
  assert.equal(await f.store.getReport(other, research.researchId), null);
  assert.equal(await f.store.getBrief(other, research.researchId, child.briefId), null);
  await f.command(['DEL', f.key(research.researchId)]);
  assert.equal(await f.store.getBrief(f.identity, research.researchId, child.briefId), null, 'An orphan brief cannot resurrect a report');
});

test('real Redis deletion or expiry yields unavailable evidence without recreating the record', async t => {
  const f = fixture(t), temporalContext = temporal();
  const research = await f.store.saveReport(f.identity, { message, report, temporalContext });
  await f.command(['PEXPIRE', f.key(research.researchId), '1']);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(await f.store.getReport(f.identity, research.researchId), null);
  assert.equal(await f.command(['EXISTS', f.key(research.researchId)]), 0);
});
