export const generationKey = "infra:auth-generation";
export const createLua =
  "return redis.call('SET',KEYS[2],ARGV[2],'NX','PX',ARGV[3])";
export const compareLua = `if redis.call('GET',KEYS[2]) ~= ARGV[2] then return 0 end
local ttl = redis.call('PTTL',KEYS[2]); if ttl <= 0 then return 0 end
redis.call('SET',KEYS[2],ARGV[3],'PX',ttl); return 1`;

export const brokerNamespace = { generationKey, keyPrefix: "auth" } as const;
