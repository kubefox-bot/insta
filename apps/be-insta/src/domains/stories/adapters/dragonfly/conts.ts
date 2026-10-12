export const feedCacheKeys = {
  version: "stories:feed:version",
  page: "stories:feed:page:",
} as const;
export const readFeedLua = `local version = redis.call('GET', KEYS[1])
if not version then version = ARGV[1]; redis.call('SET', KEYS[1], version) end
local page = redis.call('GET', KEYS[2])
return {version, page or ''}`;
export const fillFeedLua = `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[3])
return 1`;
