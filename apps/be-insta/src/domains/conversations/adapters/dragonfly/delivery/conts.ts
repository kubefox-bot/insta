export const deliveryNamespace = {
  generationKey: "infra:delivery-generation",
  keyPrefix: "conversations:delivery",
} as const;
export const streamsPolicy = {
  leaseMs: 30000,
  leaseRetryMs: 25,
  blockMs: 1000,
  pageSize: 64,
  idleGraceMs: 60000,
  maximumPageSize: 1024,
} as const;
export const leaseGuardLua = `if redis.call('GET',KEYS[2]) ~= ARGV[2] then return redis.error_reply('DELIVERY_LEASE_STALE') end
redis.call('PEXPIRE',KEYS[2],ARGV[3])
`;
export const integrityLua = `local m=redis.call('HMGET',KEYS[3],'epoch','base','tail','ready','complete')
local valid=m[1] and m[2] and m[3] and m[4]
if valid then
 local count=redis.call('XLEN',KEYS[4])
 valid=count==tonumber(m[3])-tonumber(m[2])
 if valid and count>0 then
  local first=redis.call('XRANGE',KEYS[4],'-','+','COUNT',1)
  local last=redis.call('XREVRANGE',KEYS[4],'+','-','COUNT',1)
  valid=first[1][1]==string.format('%.0f',tonumber(m[2])+1)..'-0' and last[1][1]==m[3]..'-0'
 end
end
`;
export const beginLua = `${leaseGuardLua}${integrityLua}
local epoch=ARGV[4] local base=ARGV[5]
if not valid or m[1]~=epoch or tonumber(m[2])>tonumber(base) or tonumber(m[3])<tonumber(base) then
 redis.call('DEL',KEYS[4],KEYS[3])
 redis.call('HSET',KEYS[3],'epoch',epoch,'base',base,'tail',base,'ready',base,'complete','0')
 return base
end
redis.call('XTRIM',KEYS[4],'MINID',base..'-1')
redis.call('HSET',KEYS[3],'base',base)
return m[3]
`;
export const appendLua = `${leaseGuardLua}
local m=redis.call('HMGET',KEYS[3],'epoch','tail')
if m[1]~=ARGV[4] then return 'gap' end
local id=ARGV[5]..'-0'
local duplicate=redis.call('XRANGE',KEYS[4],id,id)
if #duplicate>0 then
 if duplicate[1][2][2]~=ARGV[6] then return redis.error_reply('DELIVERY_CONFLICT') end
 return 'duplicate'
end
if tonumber(ARGV[5])-tonumber(m[2])~=1 then return 'gap' end
redis.call('XADD',KEYS[4],id,'event',ARGV[6])
redis.call('HSET',KEYS[3],'tail',ARGV[5])
return 'appended'
`;
export const readyLua = `${leaseGuardLua}${integrityLua}
if not valid or m[1]~=ARGV[4] or m[3]~=ARGV[5] then return redis.error_reply('DELIVERY_RANGE_INCOMPLETE') end
redis.call('HSET',KEYS[3],'ready',ARGV[5],'complete','1')
local expiry=math.max(tonumber(redis.call('HGET',KEYS[3],'expiry') or '0'),tonumber(ARGV[6]))
redis.call('HSET',KEYS[3],'expiry',string.format('%.0f',expiry))
redis.call('PEXPIREAT',KEYS[3],expiry)
redis.call('PEXPIREAT',KEYS[4],expiry)
return 1
`;
export const inspectLua = `${integrityLua}
if not valid or m[5]~='1' or m[1]~=ARGV[2] then return false end
return {m[1],m[2],m[4]}
`;
export const readLua = `${integrityLua}
if not valid or m[5]~='1' or m[1]~=ARGV[2] or tonumber(ARGV[3])<tonumber(m[2]) or tonumber(ARGV[3])>tonumber(m[4]) then return false end
local rows=redis.call('XRANGE',KEYS[4],'('..ARGV[3]..'-0',m[4]..'-0','COUNT',ARGV[4])
return {m[4],rows}
`;
export const reclaimPolicy = {
  scanCount: 64,
  pagesPerTurn: 4,
  maximumReturnedKeys: 4096,
  intervalMs: 1000,
} as const;
export const reclaimLua = `local identity=string.match(redis.call('INFO','replication'),'master_replid:([a-f0-9]+)')
if not identity or #identity~=40 then return redis.error_reply('BROKER_IDENTITY_UNAVAILABLE') end
local current=redis.call('GET',KEYS[1])
if not current or string.sub(current,1,40)~=identity then return redis.error_reply('BROKER_NOT_BOOTSTRAPPED') end
if current~=ARGV[1] then return redis.error_reply('BROKER_GENERATION_STALE') end
local removed=0
for i=2,#KEYS do
 local key=KEYS[i]
 local oldIdentity,nonce,kind,id,suffix=string.match(key,'^conversations:delivery:([a-f0-9]+):([a-f0-9%-]+):([a-z]+):(.+):([a-z]+)$')
 local validNonce=nonce and #nonce==36 and string.sub(nonce,9,9)=='-' and string.sub(nonce,14,14)=='-' and string.sub(nonce,19,19)=='-' and string.sub(nonce,24,24)=='-'
 if oldIdentity and #oldIdentity==40 and validNonce and (kind=='conversation' or kind=='unread') and (suffix=='lease' or suffix=='state' or suffix=='entries') and oldIdentity..':'..nonce~=current then
  removed=removed+redis.call('DEL',key)
 end
end
return removed
`;

export const retentionPolicy = {
  pagesPerTurn: 4,
  streamsPerTurn: 16,
  rowsPerStream: 64,
} as const;
export const retentionReadLua = `${leaseGuardLua}${integrityLua}
if redis.call('EXISTS',KEYS[3])==0 then return false end
if not valid then return redis.error_reply('DELIVERY_RETENTION_GAP') end
return {m[1],m[2],m[3],redis.call('XRANGE',KEYS[4],'-','+','COUNT',ARGV[4])}
`;
export const retentionTrimLua = `${leaseGuardLua}${integrityLua}
if not valid or m[1]~=ARGV[4] or m[2]~=ARGV[5] or m[3]~=ARGV[6] then return redis.error_reply('DELIVERY_RETENTION_GAP') end
local expected=cjson.decode(ARGV[8])
local actual=redis.call('XRANGE',KEYS[4],'-','+','COUNT',#expected)
if #actual~=#expected or tonumber(ARGV[7])-tonumber(m[2])~=#expected then return redis.error_reply('DELIVERY_RETENTION_GAP') end
for i=1,#actual do
 if actual[i][1]~=expected[i][1] or actual[i][2][1]~='event' or actual[i][2][2]~=expected[i][2][2] then return redis.error_reply('DELIVERY_RETENTION_CHANGED') end
 local event=cjson.decode(actual[i][2][2])
 if event.expiresAt>tonumber(ARGV[9]) then return redis.error_reply('DELIVERY_RETENTION_LIVE') end
end
local complete=m[5] or '0'
if tonumber(ARGV[7])>tonumber(m[4]) then complete='0' end
redis.call('XTRIM',KEYS[4],'MINID',ARGV[7]..'-1')
redis.call('HSET',KEYS[3],'base',ARGV[7],'complete',complete)
return #actual
`;
