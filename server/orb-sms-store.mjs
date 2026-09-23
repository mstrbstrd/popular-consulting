import { OrbError, boundedText, RETENTION_SECONDS, reservedSegments, smsBody, CLARIFICATION } from './orb-sms.mjs';

const CREATE = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
if tonumber(redis.call('GET', KEYS[3]) or '0') >= 3 or tonumber(redis.call('GET', KEYS[4]) or '0') >= 50 then return -1 end
if redis.call('INCR', KEYS[3]) == 1 then redis.call('EXPIRE', KEYS[3], 3600) end
if redis.call('INCR', KEYS[4]) == 1 then redis.call('EXPIRE', KEYS[4], 86400) end
redis.call('HSET', KEYS[1], 'code', ARGV[1], 'csrf', ARGV[2], 'expires', ARGV[3], 'next', 0, 'guests', 0)
redis.call('EXPIREAT', KEYS[1], ARGV[3])
redis.call('SET', KEYS[2], ARGV[4])
return 1`;
const SNAPSHOT = `
local n=redis.call('INCR', KEYS[2]); if n==1 then redis.call('EXPIRE', KEYS[2],60) end
if n>120 then return {'limited'} end
return redis.call('HGETALL',KEYS[1])`;
const ENQUEUE = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 'expired' end
if redis.call('HGET', KEYS[1], 'csrf') ~= ARGV[1] then return 'forbidden' end
local existing=redis.call('HGET',KEYS[1],'m:'..ARGV[2])
if existing then
  if cjson.decode(existing).content ~= ARGV[3] then return 'conflict' end
  return 'duplicate'
end
if tonumber(redis.call('HGET',KEYS[1],'next'))>=100 or tonumber(redis.call('HGET',KEYS[1],'guests'))>=20 then return 'full' end
if tonumber(redis.call('GET',KEYS[4]) or '0')>=6 or tonumber(redis.call('GET',KEYS[5]) or '0')>=100 then return 'limited' end
local m=cjson.decode(ARGV[4]); local job=cjson.decode(ARGV[5])
local seq=tonumber(redis.call('HGET',KEYS[1],'next'))+1; m.sequence=seq
local encoded=cjson.encode(m)
if redis.call('INCR',KEYS[4])==1 then redis.call('EXPIRE',KEYS[4],60) end
if redis.call('INCR',KEYS[5])==1 then redis.call('EXPIRE',KEYS[5],86400) end
redis.call('HSET',KEYS[1],'m:'..ARGV[2],encoded,'next',seq)
redis.call('HINCRBY',KEYS[1],'guests',1)
redis.call('SET',KEYS[2],ARGV[5],'EXAT',redis.call('HGET',KEYS[1],'expires'))
redis.call('ZADD',KEYS[3],job.due,job.id)
return 'queued'`;
const REPLY = `
if redis.call('EXISTS',KEYS[2])==1 then return 'duplicate' end
if redis.call('EXISTS',KEYS[1])==0 then return 'expired' end
local n=tonumber(redis.call('HGET',KEYS[1],'next'))
if n>=100 then return 'full' end
local m=cjson.decode(ARGV[2]); m.sequence=n+1; local encoded=cjson.encode(m)
redis.call('HSET',KEYS[1],'m:'..ARGV[1],encoded,'next',n+1)
redis.call('SET',KEYS[2],'1','EX',${RETENTION_SECONDS + 86400})
return 'added'`;
// Used inside job transitions; the original transcript TTL is never renewed.
const SAVE_JOB = `
local function save(job)
 local raw=redis.call('HGET',KEYS[3],'m:'..job.messageId)
 if raw then local m=cjson.decode(raw); m.delivery=job.state; redis.call('HSET',KEYS[3],'m:'..job.messageId,cjson.encode(m)) end
 redis.call('SET',KEYS[1],cjson.encode(job),'EXAT',job.expires)
 if job.state=='queued' then redis.call('ZADD',KEYS[2],job.due,job.id)
 elseif job.state=='sending' then redis.call('ZADD',KEYS[2],job.lease,job.id)
 else redis.call('ZREM',KEYS[2],job.id) end
end
`;
const CLAIM = SAVE_JOB + `
local raw=redis.call('GET',KEYS[1])
if not raw then redis.call('ZREM',KEYS[2],ARGV[1]); return false end
local job=cjson.decode(raw); local now=tonumber(ARGV[2])
if job.state=='sending' and job.lease<=now then job.state='uncertain'; save(job); return false end
if job.state~='queued' or job.due>now then return false end
if job.deadline<=now or redis.call('EXISTS',KEYS[3])==0 or redis.call('EXISTS',KEYS[5])==1 then job.state='failed'; save(job); return false end
local budget=tonumber(redis.call('GET',KEYS[4]) or '0')
if budget+job.segments>500 then job.state='failed'; save(job); return false end
redis.call('INCRBY',KEYS[4],job.segments); if budget==0 then redis.call('EXPIRE',KEYS[4],86400) end
job.state='sending'; job.attempts=job.attempts+1; job.lease=now+30000; save(job)
return cjson.encode(job)`;
const FINISH = SAVE_JOB + `
local raw=redis.call('GET',KEYS[1]); if not raw then return 'missing' end
local job=cjson.decode(raw); local state=ARGV[1]; local sid=ARGV[2]
if sid~='' and job.sid and job.sid~=sid then return 'mismatch' end
if job.state=='delivered' or job.state=='failed' then return 'terminal' end
if job.state=='queued' then return 'unclaimed' end
if sid~='' then job.sid=sid end
if state=='retry' then
 if job.state~='sending' then return 'ignored' end
 if job.attempts>=3 then state='failed' else state='queued'; job.due=tonumber(ARGV[3])+20000*job.attempts end
end
local rank={queued=0,sending=1,uncertain=1,submitted=2,sent=3,delivered=4,failed=4}
if state~='queued' and (rank[state] or -1)<(rank[job.state] or 0) then return 'ignored' end
job.state=state; save(job); return 'saved'`;
const CLARIFY = `
if redis.call('EXISTS',KEYS[1])==1 then return 0 end
redis.call('SET',KEYS[1],'1','EX',${RETENTION_SECONDS + 86400})
if tonumber(redis.call('GET',KEYS[2]) or '0')>=3 or tonumber(redis.call('GET',KEYS[3]) or '0')+${reservedSegments(CLARIFICATION)}>500 then return 0 end
if redis.call('INCR',KEYS[2])==1 then redis.call('EXPIRE',KEYS[2],3600) end
if redis.call('INCRBY',KEYS[3],${reservedSegments(CLARIFICATION)})==${reservedSegments(CLARIFICATION)} then redis.call('EXPIRE',KEYS[3],86400) end
return 1`;

export function createOrbStore(config, fetchImpl = fetch) {
  const key = (type, id = '') => `${config.prefix}${type}:${id}`;
  const command = async args => {
    const response = await fetchImpl(config.redisUrl, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(4000),
      headers: { Authorization: `Bearer ${config.redisToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
    });
    if (!response.ok) throw new OrbError('store_unavailable', 503);
    const data = JSON.parse(await boundedText(response, 524288));
    if (!data || data.error || !Object.prototype.hasOwnProperty.call(data, 'result')) throw new OrbError('store_unavailable', 503);
    return data.result;
  };
  const evaluate = (script, keys, args = []) => command(['EVAL', script, keys.length, ...keys, ...args]);
  const jobKeys = jobId => [key('job', jobId), key('queue'), key('conversation', jobId.split('.')[0])];
  return {
    async create(id, code, csrf, ip, now = Date.now()) {
      const expires = Math.floor(now / 1000) + RETENTION_SECONDS;
      return evaluate(CREATE, [key('conversation', id), key('code', code), key('create-ip', ip), key('create-all')], [code, csrf, expires, id]);
    },
    async snapshot(id, ip) {
      const pairs = await evaluate(SNAPSHOT, [key('conversation', id), key('reads', ip)]);
      if (!Array.isArray(pairs)) throw new OrbError('store_unavailable', 503);
      if (pairs[0] === 'limited') throw new OrbError('rate_limited', 429);
      if (!pairs.length) return null;
      const fields = Object.fromEntries(Array.from({ length: pairs.length / 2 }, (_, i) => [pairs[i * 2], pairs[i * 2 + 1]]));
      const messages = Object.entries(fields).filter(([name]) => name.startsWith('m:')).map(([, value]) => JSON.parse(value));
      messages.sort((a, b) => a.sequence - b.sequence);
      if (messages.length > 100 || !fields.csrf || !fields.code || !Number.isFinite(Number(fields.expires))) throw new OrbError('store_unavailable', 503);
      return { csrfToken: fields.csrf, code: fields.code, expiresAt: Number(fields.expires) * 1000, messages };
    },
    async enqueue(id, session, clientId, content, ip, now = Date.now()) {
      const job = { id: `${id}.${clientId}`, messageId: clientId, code: session.code, content,
        state: 'queued', attempts: 0, due: now, deadline: now + 600000, expires: session.expiresAt / 1000 };
      job.segments = reservedSegments(smsBody(job));
      const message = { id: clientId, role: 'user', content, createdAt: now, delivery: 'queued' };
      const result = await evaluate(ENQUEUE, [key('conversation', id), key('job', job.id), key('queue'), key('write-ip', ip), key('write-all')],
        [session.csrfToken, clientId, content, JSON.stringify(message), JSON.stringify(job)]);
      const errors = { expired: ['session_expired', 410], forbidden: ['invalid_csrf', 403], conflict: ['idempotency_conflict', 409], full: ['conversation_full', 409], limited: ['rate_limited', 429] };
      if (errors[result]) throw new OrbError(...errors[result]);
      if (!['queued', 'duplicate'].includes(result)) throw new OrbError('store_unavailable', 503);
      return job.id;
    },
    async close(id, csrf) {
      return evaluate(`
if redis.call('HGET',KEYS[1],'csrf')~=ARGV[1] then return 0 end
local fields=redis.call('HKEYS',KEYS[1])
for _,field in ipairs(fields) do
 if string.sub(field,1,2)=='m:' then
  local m=cjson.decode(redis.call('HGET',KEYS[1],field))
  if m.role=='user' then local job=ARGV[2]..'.'..m.id; redis.call('DEL',ARGV[3]..job); redis.call('ZREM',KEYS[2],job) end
 end
end
redis.call('DEL',KEYS[1]); return 1`, [key('conversation', id), key('queue')], [csrf, id, key('job')]);
    },
    async reply(code, sid, content, now = Date.now()) {
      const id = await command(['GET', key('code', code)]);
      if (!id) return 'expired';
      const message = { id: sid, role: 'assistant', content, createdAt: now, delivery: 'received' };
      return evaluate(REPLY, [key('conversation', id), key('seen', sid)], [sid, JSON.stringify(message)]);
    },
    async clarify(sid) { return (await evaluate(CLARIFY, [key('seen', sid), key('clarifications'), key('sms-budget')])) === 1; },
    async pause(sid, paused) {
      return evaluate(`if redis.call('EXISTS',KEYS[1])==1 then return 0 end
redis.call('SET',KEYS[1],'1','EX',${RETENTION_SECONDS + 86400})
if ARGV[1]=='1' then redis.call('SET',KEYS[2],'1') else redis.call('DEL',KEYS[2]) end; return 1`,
        [key('seen', sid), key('paused')], [paused ? '1' : '0']);
    },
    async due(now = Date.now()) { return command(['ZRANGEBYSCORE', key('queue'), '-inf', now, 'LIMIT', 0, 8]); },
    async claim(jobId, now = Date.now()) {
      const result = await evaluate(CLAIM, [...jobKeys(jobId), key('sms-budget'), key('paused')], [jobId, now]);
      return result ? JSON.parse(result) : null;
    },
    async finish(jobId, state, sid = '', now = Date.now()) { return evaluate(FINISH, jobKeys(jobId), [state, sid, now]); },
  };
}
