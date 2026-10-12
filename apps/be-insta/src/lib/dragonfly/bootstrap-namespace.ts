import type {
  DragonflyCommands,
  DragonflyNamespace,
} from "@insta/fe-core/dragonfly/server";
import { processIdentityLua } from "./conts";
/** Инициализирует только переданный namespace для текущего процесса; клиент заимствован, auth namespace не выбирается неявно. */
export const bootstrapNamespaceGeneration = async ({
  client,
  namespace,
}: Readonly<{
  client: DragonflyCommands;
  namespace: DragonflyNamespace;
}>): Promise<void> => {
  await client.send("EVAL", [
    processIdentityLua +
      "local current=redis.call('GET',KEYS[1]) if not current or string.sub(current,1,40)~=identity then redis.call('SET',KEYS[1],identity..':'..ARGV[1]) end return 1",
    "1",
    namespace.generationKey,
    crypto.randomUUID(),
  ]);
};
