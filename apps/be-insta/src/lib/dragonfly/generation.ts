import type { DragonflyCommands } from "@insta/fe-core/dragonfly/server";
import {
  evaluateFenced as evaluate,
  readGeneration as read,
} from "@insta/fe-core/dragonfly/server";
import type { RedisClient } from "bun";
import { brokerNamespace, generationKey, processIdentityLua } from "./conts";

/** Добавляет проверку идентичности процесса к Lua-командам заимствованного Dragonfly-клиента. */
const strictIdentityClient = (
  client: DragonflyCommands,
): DragonflyCommands => ({
  /** Читает ключ через заимствованный клиент без изменения его lifecycle. */
  get: (key) => client.get(key),
  /** Предваряет Lua-скрипт проверкой process identity, сохраняя оставшиеся аргументы команды. */
  send: (command, args) =>
    client.send(command, [`${processIdentityLua}${args[0]}`, ...args.slice(1)]),
});
const generationGuardLua = `${processIdentityLua}
local current = redis.call('GET', KEYS[1])
if not current or string.sub(current, 1, 40) ~= identity then return redis.error_reply('BROKER_NOT_BOOTSTRAPPED') end
`;
/** Читает generation с проверкой идентичности процесса; устаревшая сессия брокера не считается действующей. */
export const readGeneration = (client: RedisClient): Promise<string> =>
  read({ client: strictIdentityClient(client), namespace: brokerNamespace });
/** Выполняет Lua-операцию только внутри ожидаемой generation и namespace брокера. */
export const evaluateFenced = (
  input: Omit<Parameters<typeof evaluate>[0], "namespace">,
): Promise<unknown> =>
  evaluate({
    ...input,
    client: strictIdentityClient(input.client),
    namespace: brokerNamespace,
  });
// Ephemeral owners may delete their keys from a retired generation. All keys
// remain declared to Dragonfly and current process identity is fenced atomically.
/** Удаляет только явно перечисленные ключи устаревшей generation в принадлежащем namespace; текущая generation защищена. */
export const deleteRetiredKeys = async ({
  client,
  generation,
  retiredGeneration,
  namespace,
  keys,
}: Readonly<{
  client: RedisClient;
  generation: string;
  retiredGeneration: string;
  namespace: string;
  keys: readonly string[];
}>) => {
  if (
    retiredGeneration === generation ||
    !/^[a-f0-9]{40}:[a-f0-9-]{36}$/.test(retiredGeneration)
  )
    throw new Error("Expected retired broker generation");
  if (
    !/^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*$/.test(namespace) ||
    keys.some(
      (key) =>
        !key.startsWith(`${namespace}:`) || !/^[A-Za-z0-9_:-]+$/.test(key),
    )
  )
    throw new Error("Key outside owned ephemeral namespace");
  if (!keys.length) return;
  await client.send("EVAL", [
    `${generationGuardLua} if current ~= ARGV[1] then return redis.error_reply('BROKER_GENERATION_STALE') end\nfor i = 2, #KEYS do redis.call('DEL', KEYS[i]) end return 1`,
    String(keys.length + 1),
    generationKey,
    ...keys.map((key) => `auth:${retiredGeneration}:${key}`),
    generation,
  ]);
};
