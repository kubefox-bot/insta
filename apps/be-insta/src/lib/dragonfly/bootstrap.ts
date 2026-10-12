import type { RedisClient } from "bun";
import { generationKey, processIdentityLua } from "./conts";
// Called only by the infrastructure bootstrap job, never by app startup.
/** Инициализирует generation для текущей идентичности процесса Dragonfly, сохраняя существующий маркер того же процесса. */
export const bootstrapGeneration = async (
  client: RedisClient,
): Promise<void> => {
  await client.send("EVAL", [
    `${processIdentityLua}
local current = redis.call('GET', KEYS[1])
if not current or string.sub(current, 1, 40) ~= identity then
  redis.call('SET', KEYS[1], identity .. ':' .. ARGV[1])
end
return 1`,
    "1",
    generationKey,
    crypto.randomUUID(),
  ]);
};
