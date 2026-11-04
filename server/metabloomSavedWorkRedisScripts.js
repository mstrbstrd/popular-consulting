const { MAX_METABLOOM_SAVED_CONTENT_BYTES } = require('./metabloomSavedContent');

const MAX_SAVED_ARTIFACTS = 50;
const MAX_SAVED_ACCOUNT_BYTES = 32 * 1024 * 1024;
const MAX_SAVED_CREATE_REQUESTS = 1000;
const MAX_SAVED_REVISIONS = 64;
// Never decremented by Delete: empty historical fields still occupy the hash.
const MAX_SAVED_REVISION_FIELDS = 8192;
const MAX_SAVED_STATE_BYTES = 1024 * 1024;

const limits = `local MAX_STATE = ${MAX_SAVED_STATE_BYTES}
local MAX_BYTES = ${MAX_SAVED_ACCOUNT_BYTES}
local MAX_FIELDS = ${MAX_SAVED_REVISION_FIELDS}
local MAX_ARTIFACTS = ${MAX_SAVED_ARTIFACTS}
local MAX_REQUESTS = ${MAX_SAVED_CREATE_REQUESTS}
local MAX_REVISIONS = ${MAX_SAVED_REVISIONS}
local MAX_CONTENT = ${MAX_METABLOOM_SAVED_CONTENT_BYTES}
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
    or KEYS[1]~='metabloom:saved:v1:{'..scope..':'..owner..'}' then
    return nil,nil,'saved_work_invalid'
  end
  local kind=redis.call('TYPE',KEYS[1])
  if type(kind)=='table' then kind=kind.ok end
  if kind=='none' then return false,false,nil end
  if kind~='hash' or redis.call('PTTL',KEYS[1])~=-1 then return nil,nil,'saved_work_corrupt' end
  local raw=redis.call('HGET',KEYS[1],'state')
  if not raw or #raw>MAX_STATE then return nil,nil,'saved_work_corrupt' end
  local valid,state=pcall(cjson.decode,raw)
  if not valid or type(state)~='table' then return nil,nil,'saved_work_corrupt' end
  if state.schemaVersion~=1 then return nil,nil,'saved_work_unsupported' end
  if state.scope~=scope or state.accountKey~=owner then return nil,nil,'saved_work_environment_mismatch' end
  if not integer(state.allocatedRevisions,0,MAX_FIELDS) or not integer(state.totalBytes,0,MAX_BYTES)
    or not count(state.artifacts,MAX_ARTIFACTS) or not count(state.requests,MAX_REQUESTS)
    or redis.call('HLEN',KEYS[1])~=state.allocatedRevisions+1 then return nil,nil,'saved_work_corrupt' end
  return raw,state,nil
end
`;

// Keep ordinary EVAL, without no-writes/EVAL_RO. Upstash routes these reads to
// the primary, and one script snapshots metadata and its selected payload.
const READ_SAVED_WORK_SCRIPT = limits + inspect + `if #ARGV~=5 then return failure('saved_work_invalid') end
local mode=ARGV[3]
if mode~='state' and mode~='artifact' and mode~='request' then return failure('saved_work_invalid') end
local raw,state,problem=inspect(ARGV[1],ARGV[2])
if problem then return failure(problem) end
if not raw then return {false,false} end
if mode=='state' then return {raw,false} end
if not uuid(ARGV[4]) then return failure('saved_work_invalid') end
local artifactId=ARGV[4]
if mode=='request' then
  local request=state.requests[artifactId]
  if not request then return {raw,false} end
  if type(request)~='table' or not uuid(request.artifactId) or type(request.retired)~='boolean' then
    return failure('saved_work_corrupt')
  end
  if request.retired then return {raw,false} end
  artifactId=request.artifactId
end
local item=state.artifacts[artifactId]
if not item then return {raw,false} end
if type(item)~='table' or not integer(item.headRevision,1,MAX_REVISIONS) then return failure('saved_work_corrupt') end
local revision=tonumber(ARGV[5])
if not integer(revision,0,2147483647) then return failure('saved_work_invalid') end
if mode=='request' or revision==0 then revision=item.headRevision end
if revision>item.headRevision then return {raw,false} end
local content=redis.call('HGET',KEYS[1],'revision:'..artifactId..':'..revision)
if not content or #content<2 or #content>MAX_CONTENT then return failure('saved_work_corrupt') end
return {raw,content}
`;

const COMMIT_SAVED_WORK_SCRIPT = limits + inspect + `if #ARGV<6 or (#ARGV-6)%2~=0 then return failure('saved_work_invalid') end
local expected=ARGV[1]
local nextRaw=ARGV[2]
local operation=ARGV[3]
local target=ARGV[4]
if #expected>MAX_STATE or #nextRaw>MAX_STATE then return failure('saved_work_limit') end
if operation~='ensure' and operation~='create' and operation~='append'
  and operation~='rename' and operation~='delete' then return failure('saved_work_invalid') end
local raw,state,problem=inspect(ARGV[5],ARGV[6])
if problem then return failure(problem) end
if (raw or '')~=expected then return failure('saved_work_conflict') end
local valid,nextState=pcall(cjson.decode,nextRaw)
if not valid or type(nextState)~='table' or nextState.schemaVersion~=1
  or nextState.scope~=ARGV[5] or nextState.accountKey~=ARGV[6]
  or not uuid(nextState.accountId) or not uuid(nextState.workspaceId)
  or not integer(nextState.totalBytes,0,MAX_BYTES) or not integer(nextState.allocatedRevisions,0,MAX_FIELDS)
  or not count(nextState.artifacts,MAX_ARTIFACTS) or not count(nextState.requests,MAX_REQUESTS) then
  return failure('saved_work_corrupt')
end
if state and (nextState.accountId~=state.accountId or nextState.workspaceId~=state.workspaceId
  or nextState.createdAt~=state.createdAt) then return failure('saved_work_corrupt') end
if not state and operation~='ensure' and operation~='create' then return failure('saved_work_not_found') end
local oldBytes=state and state.totalBytes or 0
local oldFields=state and state.allocatedRevisions or 0
local oldCount=state and count(state.artifacts,MAX_ARTIFACTS) or 0
local oldRequests=state and count(state.requests,MAX_REQUESTS) or 0
local oldItem=state and state.artifacts[target]
local nextItem=nextState.artifacts[target]
if operation=='ensure' then
  if state or target~='' or #ARGV~=6 or nextState.totalBytes~=0 or nextState.allocatedRevisions~=0
    or count(nextState.artifacts,MAX_ARTIFACTS)~=0 or count(nextState.requests,MAX_REQUESTS)~=0 then
    return failure('saved_work_corrupt')
  end
else
  if not uuid(target) then return failure('saved_work_invalid') end
  if operation~='create' and (not oldItem or type(oldItem)~='table') then return failure('saved_work_not_found') end
  if oldItem and (not integer(oldItem.headRevision,1,MAX_REVISIONS)
    or not integer(oldItem.version,oldItem.headRevision,2147483647) or type(oldItem.revisions)~='table'
    or #oldItem.revisions~=oldItem.headRevision) then return failure('saved_work_corrupt') end
  if operation=='create' or operation=='append' then
    local revision=operation=='create' and 1 or oldItem.headRevision+1
    if revision>MAX_REVISIONS or oldFields>=MAX_FIELDS then return failure('saved_work_limit') end
    if #ARGV~=8 or ARGV[7]~='revision:'..target..':'..revision
      or #ARGV[8]<2 or #ARGV[8]>MAX_CONTENT
      or type(nextItem)~='table' or nextItem.headRevision~=revision
      or not integer(nextItem.version,revision,2147483647)
      or type(nextItem.revisions)~='table' or #nextItem.revisions~=revision
      or type(nextItem.revisions[revision])~='table'
      or nextItem.revisions[revision].bytes~=#ARGV[8]
      or nextState.totalBytes~=oldBytes+#ARGV[8] or nextState.allocatedRevisions~=oldFields+1
      or redis.call('HEXISTS',KEYS[1],ARGV[7])~=0 then return failure('saved_work_corrupt') end
    if operation=='create' then
      if oldItem or nextItem.version~=1 or not uuid(nextItem.requestId)
        or (state and state.requests[nextItem.requestId])
        or count(nextState.artifacts,MAX_ARTIFACTS)~=oldCount+1
        or count(nextState.requests,MAX_REQUESTS)~=oldRequests+1 then return failure('saved_work_corrupt') end
      local request=nextState.requests[nextItem.requestId]
      if type(request)~='table' or request.retired~=false or request.artifactId~=target then
        return failure('saved_work_corrupt')
      end
    else
      if nextItem.version~=oldItem.version+1 or nextItem.requestId~=oldItem.requestId
        or nextItem.kind~=oldItem.kind or nextItem.title~=oldItem.title
        or nextItem.createdAt~=oldItem.createdAt
        or count(nextState.artifacts,MAX_ARTIFACTS)~=oldCount
        or count(nextState.requests,MAX_REQUESTS)~=oldRequests then return failure('saved_work_corrupt') end
    end
  elseif operation=='rename' then
    if #ARGV~=6 or type(nextItem)~='table' or nextItem.version~=oldItem.version+1
      or nextItem.headRevision~=oldItem.headRevision or nextItem.kind~=oldItem.kind
      or nextItem.requestId~=oldItem.requestId or nextItem.createdAt~=oldItem.createdAt
      or nextState.totalBytes~=oldBytes or nextState.allocatedRevisions~=oldFields
      or count(nextState.artifacts,MAX_ARTIFACTS)~=oldCount
      or count(nextState.requests,MAX_REQUESTS)~=oldRequests then return failure('saved_work_corrupt') end
  else
    if #ARGV~=6+oldItem.headRevision*2 or nextItem
      or nextState.allocatedRevisions~=oldFields
      or count(nextState.artifacts,MAX_ARTIFACTS)~=oldCount-1
      or count(nextState.requests,MAX_REQUESTS)~=oldRequests then return failure('saved_work_corrupt') end
    local request=nextState.requests[oldItem.requestId]
    if type(request)~='table' or request.retired~=true or request.artifactId~=target then
      return failure('saved_work_corrupt')
    end
    local removed=0
    for revision=1,oldItem.headRevision do
      local entry=oldItem.revisions[revision]
      local field=ARGV[5+revision*2]
      if type(entry)~='table' or not integer(entry.bytes,2,MAX_CONTENT)
        or field~='revision:'..target..':'..revision or ARGV[6+revision*2]~=''
        or redis.call('HSTRLEN',KEYS[1],field)~=entry.bytes then return failure('saved_work_corrupt') end
      removed=removed+entry.bytes
    end
    if nextState.totalBytes~=oldBytes-removed then return failure('saved_work_corrupt') end
  end
  if oldItem and nextItem then
    for revision=1,oldItem.headRevision do
      local before=oldItem.revisions[revision]
      local after=nextItem.revisions[revision]
      if type(before)~='table' or type(after)~='table' or before.revision~=after.revision
        or before.createdAt~=after.createdAt or before.bytes~=after.bytes or before.sha256~=after.sha256 then
        return failure('saved_work_corrupt')
      end
    end
  end
end
-- Prepare every argument and the receipt before the only write. Redis Lua and
-- MULTI do not roll back preceding writes when a later command errors.
local args={'HSET',KEYS[1],'state',nextRaw}
for index=7,#ARGV do args[#args+1]=ARGV[index] end
local result={'ok'}
redis.call(unpack(args))
return result
`;

module.exports = { READ_SAVED_WORK_SCRIPT, COMMIT_SAVED_WORK_SCRIPT,
  MAX_SAVED_ARTIFACTS, MAX_SAVED_ACCOUNT_BYTES, MAX_SAVED_CREATE_REQUESTS,
  MAX_SAVED_REVISIONS, MAX_SAVED_REVISION_FIELDS, MAX_SAVED_STATE_BYTES };
