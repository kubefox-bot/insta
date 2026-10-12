export const readLua = "return redis.call('GET', KEYS[2])";
export const saveLua = `
local count = redis.call('INCR', KEYS[3])
if count == 1 then redis.call('PEXPIRE', KEYS[3], ARGV[5]) end
if count > tonumber(ARGV[6]) then return 'rateLimited' end
local previous = redis.call('GET', KEYS[2])
local expected = ARGV[3]
if previous then
  if expected == '' or cjson.decode(previous).revision ~= tonumber(expected) then return 'conflict' end
elseif expected ~= '' then return 'conflict' end
redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[4])
return 'saved'
`;
