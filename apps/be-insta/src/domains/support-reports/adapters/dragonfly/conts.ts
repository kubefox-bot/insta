export const supportStream = "support:mail";
export const supportStreamMaxLength = 1000;
export const supportQuotaLua = `local count = redis.call('INCR', KEYS[2])
if count == 1 then redis.call('PEXPIRE', KEYS[2], ARGV[2]) end
return count`;
