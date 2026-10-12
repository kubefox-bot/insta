export const quotaWindowMs = 60000;
export const quotaLua = `
local count = redis.call('INCR', KEYS[2])
if count == 1 then redis.call('PEXPIRE', KEYS[2], ARGV[2]) end
return {count, redis.call('PTTL', KEYS[2])}
`;
