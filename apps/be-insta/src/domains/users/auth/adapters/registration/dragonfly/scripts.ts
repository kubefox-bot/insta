export const registrationClockLua = `
local function currentTime(requested)
 local time = redis.call('TIME')
 return math.max(tonumber(requested), tonumber(time[1])*1000 + math.floor(tonumber(time[2])/1000))
end
`;
export const enqueueLua = `${registrationClockLua}
local stored = redis.call('GET', KEYS[2])
local previous = stored and cjson.decode(stored) or nil
local expected = tonumber(ARGV[2])
if (previous and previous.revision or 0) ~= expected or (previous and previous.version or '') ~= ARGV[9] then return 'REGISTRATION_CONFLICT' end
local challenge = cjson.decode(ARGV[3])
local now = currentTime(ARGV[4])
if challenge.registrationExpiresAt <= now then return 'REGISTRATION_EXPIRED' end
if previous and previous.registrationExpiresAt > now then
  if previous.errors >= tonumber(ARGV[8]) then return 'CODE_EXHAUSTED' end
  if previous.nextSendAt > now then return 'RESEND_COOLDOWN' end
  if challenge.registrationExpiresAt > previous.registrationExpiresAt or challenge.errors ~= previous.errors then return 'REGISTRATION_CONFLICT' end
end
redis.call('SET', KEYS[2], ARGV[3], 'PX', challenge.registrationExpiresAt-now)
redis.call('SET', KEYS[4], ARGV[5], 'PX', challenge.registrationExpiresAt-now)
redis.call('XADD', KEYS[3], '*', 'challengeId', challenge.challengeId, 'version', challenge.version, 'operationId', ARGV[6], 'generation', ARGV[1])
if KEYS[5] ~= KEYS[4] then redis.call('DEL', KEYS[5]) end
return 'OK'
`;
export const verifyLua = `${registrationClockLua}
local stored = redis.call('GET', KEYS[2])
if not stored then return {'CODE_INVALID'} end
local current = cjson.decode(stored)
local now = currentTime(ARGV[3])
if current.registrationExpiresAt <= now then return {'REGISTRATION_EXPIRED'} end
if current.errors >= tonumber(ARGV[5]) then return {'CODE_EXHAUSTED'} end
if current.consumed then return {'CODE_INVALID'} end
if current.revision ~= tonumber(ARGV[2]) or current.version ~= ARGV[6] then return {'REGISTRATION_CONFLICT'} end
current.revision = current.revision + 1
if ARGV[4] ~= '1' then
 current.errors = current.errors + 1
 redis.call('SET', KEYS[2], cjson.encode(current), 'KEEPTTL')
 return {'CODE_INVALID'}
end
local ciphertext = current.ciphertext
current.consumed = true
current.ciphertext = ''
redis.call('SET', KEYS[2], cjson.encode(current), 'KEEPTTL')
return {'OK', ciphertext}
`;

export const ownerGuard = `local pending = redis.call('XPENDING', KEYS[2], ARGV[2], ARGV[3], ARGV[3], 1)\nif #pending == 0 or pending[1][2] ~= ARGV[4] then return nil end\n`;
