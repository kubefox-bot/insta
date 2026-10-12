export const generationKey = "infra:auth-generation";
export const processIdentityLua = `local info = redis.call('INFO', 'replication')
local identity = string.match(info, 'master_replid:([a-f0-9]+)')
if not identity or #identity ~= 40 then return redis.error_reply('BROKER_IDENTITY_UNAVAILABLE') end
`;

export const brokerNamespace = { generationKey, keyPrefix: "auth" } as const;
