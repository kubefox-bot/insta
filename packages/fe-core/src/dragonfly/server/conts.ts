export const generationGuardLua = `local identity = string.match(redis.call('INFO','replication'), 'master_replid:([a-f0-9]+)')
if not identity then return redis.error_reply('BROKER_IDENTITY_UNAVAILABLE') end
local current = redis.call('GET', KEYS[1])
if not current or string.sub(current,1,40) ~= identity then return redis.error_reply('BROKER_NOT_BOOTSTRAPPED') end
`;
