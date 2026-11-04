const { MAX_METABLOOM_THREAD_SNAPSHOT_BYTES, MAX_METABLOOM_THREADS } = require('../src/components/metabloomThreadProtocol');

const MAX_THREAD_ACCOUNT_BYTES = 16 * 1024 * 1024;
// Deleted IDs and their empty fields remain allocated. This lifetime bound
// protects both the permanent tombstone ledger and the physical Redis hash.
const MAX_THREAD_IDS = 1000;
const MAX_THREAD_STATE_BYTES = 512 * 1024;

const limits = `local MAX_STATE=${MAX_THREAD_STATE_BYTES}
local MAX_BYTES=${MAX_THREAD_ACCOUNT_BYTES}
local MAX_IDS=${MAX_THREAD_IDS}
local MAX_THREADS=${MAX_METABLOOM_THREADS}
local MAX_CONTENT=${MAX_METABLOOM_THREAD_SNAPSHOT_BYTES}
`;

const inspect = `local function failure(code) return {'error',code} end
local function integer(value,minimum,maximum)
  return type(value)=='number' and value==math.floor(value) and value>=minimum and value<=maximum
end
local function identifier(value)
  return type(value)=='string' and #value==64 and not string.find(value,'[^0-9a-f]')
end
local function uuid(value)
  if type(value)~='string' or #value~=36 then return false end
  local a,b,c,d,e=string.match(value,'^([0-9a-f]+)%-([0-9a-f]+)%-([1-8][0-9a-f]+)%-([89ab][0-9a-f]+)%-([0-9a-f]+)$')
  return a and #a==8 and #b==4 and #c==4 and #d==4 and #e==12
end
local function count(value,maximum)
  if type(value)~='table' then return nil end
  local result=0
  for _ in pairs(value) do
    result=result+1
    if result>maximum then return nil end
  end
  return result
end
local function inspect(scope,owner)
  if #KEYS~=1 or not identifier(scope) or not identifier(owner)
    or KEYS[1]~='metabloom:threads:v1:{'..scope..':'..owner..'}' then return nil,nil,'threads_invalid' end
  local kind=redis.call('TYPE',KEYS[1])
  if type(kind)=='table' then kind=kind.ok end
  if kind=='none' then return false,false,nil end
  if kind~='hash' or redis.call('PTTL',KEYS[1])~=-1 then return nil,nil,'threads_corrupt' end
  local raw=redis.call('HGET',KEYS[1],'state')
  if not raw or #raw>MAX_STATE then return nil,nil,'threads_corrupt' end
  local valid,state=pcall(cjson.decode,raw)
  if not valid or type(state)~='table' then return nil,nil,'threads_corrupt' end
  if state.schemaVersion~=1 then return nil,nil,'threads_unsupported' end
  if state.scope~=scope or state.accountKey~=owner then return nil,nil,'threads_unavailable' end
  local active=count(state.threads,MAX_THREADS)
  local deleted=count(state.deleted,MAX_IDS)
  if not active or not deleted or active+deleted>MAX_IDS or not integer(state.totalBytes,0,MAX_BYTES)
    or redis.call('HLEN',KEYS[1])~=active+deleted+1 then return nil,nil,'threads_corrupt' end
  return raw,state,nil
end
`;

// Ordinary EVAL routes to the primary. Metadata and the selected snapshot are
// read together so a concurrent update/delete cannot split their versions.
const READ_THREADS_SCRIPT = limits + inspect + `if #ARGV~=4 then return failure('threads_invalid') end
local mode=ARGV[3]
if mode~='state' and mode~='thread' then return failure('threads_invalid') end
if (mode=='thread' and not uuid(ARGV[4])) or (mode=='state' and ARGV[4]~='') then return failure('threads_invalid') end
local raw,state,problem=inspect(ARGV[1],ARGV[2])
if problem then return failure(problem) end
if not raw or mode=='state' then return {raw or false,false} end
local item=state.threads[ARGV[4]]
if not item then return {raw,false} end
if type(item)~='table' or not integer(item.bytes,2,MAX_CONTENT) then return failure('threads_corrupt') end
local content=redis.call('HGET',KEYS[1],'snapshot:'..ARGV[4])
if not content or #content~=item.bytes then return failure('threads_corrupt') end
return {raw,content}
`;

const COMMIT_THREADS_SCRIPT = limits + inspect + `if #ARGV~=7 then return failure('threads_invalid') end
local expected,nextRaw,operation,target=ARGV[1],ARGV[2],ARGV[3],ARGV[4]
if #expected>MAX_STATE or #nextRaw>MAX_STATE then return failure('threads_limit') end
if not uuid(target) or (operation~='save' and operation~='rename' and operation~='delete') then
  return failure('threads_invalid')
end
local raw,state,problem=inspect(ARGV[5],ARGV[6])
if problem then return failure(problem) end
if (raw or '')~=expected then return failure('threads_conflict') end
local valid,nextState=pcall(cjson.decode,nextRaw)
if not valid or type(nextState)~='table' or nextState.schemaVersion~=1
  or nextState.scope~=ARGV[5] or nextState.accountKey~=ARGV[6]
  or not integer(nextState.totalBytes,0,MAX_BYTES) then return failure('threads_corrupt') end
local nextCount=count(nextState.threads,MAX_THREADS)
local nextDeleted=count(nextState.deleted,MAX_IDS)
if not nextCount or not nextDeleted or nextCount+nextDeleted>MAX_IDS then return failure('threads_limit') end
local oldCount=state and count(state.threads,MAX_THREADS) or 0
local oldDeleted=state and count(state.deleted,MAX_IDS) or 0
local oldBytes=state and state.totalBytes or 0
local oldItem=state and state.threads[target]
local nextItem=nextState.threads[target]
if state and state.deleted[target] then return failure('threads_deleted') end
local field='snapshot:'..target
if oldItem then
  if type(oldItem)~='table' or not integer(oldItem.version,1,2147483647)
    or not integer(oldItem.bytes,2,MAX_CONTENT)
    or redis.call('HSTRLEN',KEYS[1],field)~=oldItem.bytes then return failure('threads_corrupt') end
elseif operation~='save' then return failure('threads_not_found') end
if operation=='save' then
  if #ARGV[7]<2 or #ARGV[7]>MAX_CONTENT or type(nextItem)~='table'
    or nextItem.threadId~=target or nextItem.operation~='save'
    or nextItem.version~=(oldItem and oldItem.version+1 or 1)
    or nextItem.bytes~=#ARGV[7] or nextState.deleted[target]
    or nextCount~=oldCount+(oldItem and 0 or 1) or nextDeleted~=oldDeleted
    or nextState.totalBytes~=oldBytes-(oldItem and oldItem.bytes or 0)+#ARGV[7]
    or (not oldItem and redis.call('HEXISTS',KEYS[1],field)~=0)
    or (oldItem and nextItem.createdAt~=oldItem.createdAt) then return failure('threads_corrupt') end
elseif operation=='rename' then
  if ARGV[7]~='' or type(nextItem)~='table' or nextItem.threadId~=target or nextItem.operation~='rename'
    or nextItem.version~=oldItem.version+1 or nextItem.createdAt~=oldItem.createdAt
    or nextItem.bytes~=oldItem.bytes or nextItem.sha256~=oldItem.sha256
    or nextItem.messageCount~=oldItem.messageCount or nextState.deleted[target]
    or nextCount~=oldCount or nextDeleted~=oldDeleted or nextState.totalBytes~=oldBytes then
    return failure('threads_corrupt')
  end
else
  local removed=nextState.deleted[target]
  if ARGV[7]~='' or nextItem or type(removed)~='table' or removed.version~=oldItem.version+1
    or nextCount~=oldCount-1 or nextDeleted~=oldDeleted+1
    or nextState.totalBytes~=oldBytes-oldItem.bytes then return failure('threads_corrupt') end
end
-- No writes precede this HSET. Prepare arguments and receipt before committing;
-- Lua cannot roll back earlier writes if a later Redis command fails.
local args={'HSET',KEYS[1],'state',nextRaw}
if operation~='rename' then args[#args+1]=field args[#args+1]=ARGV[7] end
local result={'ok'}
redis.call(unpack(args))
return result
`;

module.exports = { READ_THREADS_SCRIPT, COMMIT_THREADS_SCRIPT,
  MAX_THREAD_ACCOUNT_BYTES, MAX_THREAD_IDS, MAX_THREAD_STATE_BYTES };
