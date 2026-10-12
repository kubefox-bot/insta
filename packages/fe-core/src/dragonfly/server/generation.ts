import { generationGuardLua } from "./conts";
import type { FencedInput, GenerationInput } from "./types";

/** Читает generation через атомарный Lua guard и отклоняет нестроковый ответ брокера; использует заимствованный клиент без закрытия соединения. */
export const readGeneration = async ({
  client,
  namespace,
}: GenerationInput): Promise<string> => {
  const value = await client.send("EVAL", [
    `${generationGuardLua} return current`,
    "1",
    namespace.generationKey,
  ]);
  if (typeof value !== "string") throw new Error("Invalid broker generation");
  return value;
};
/** Fence и операция атомарны; KEYS[1]/ARGV[1] зарезервированы протоколом. */
export const evaluateFenced = ({
  client,
  namespace,
  generation,
  script,
  keys = [],
  arguments: args = [],
}: FencedInput): Promise<unknown> =>
  client.send("EVAL", [
    `${generationGuardLua} if current ~= ARGV[1] then return redis.error_reply('BROKER_GENERATION_STALE') end\n${script}`,
    String(keys.length + 1),
    namespace.generationKey,
    ...keys.map((key) => `${namespace.keyPrefix}:${generation}:${key}`),
    generation,
    ...args,
  ]);
