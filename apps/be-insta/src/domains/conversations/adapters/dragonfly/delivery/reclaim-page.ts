import { reclaimLua } from "./conts";
import { parseOwnedKey, scanOwnedPage } from "./scan";
import type { StreamsDependencies } from "./types";
/** Удаляет не более одной SCAN страницы, атомарно перепроверяя current generation перед каждым пакетом DEL. */
export const reclaimPage = async (
  { cursor, generation }: Readonly<{ cursor: string; generation: string }>,
  dependencies: StreamsDependencies,
) => {
  const [next, keys] = await scanOwnedPage(cursor, dependencies);
  const obsolete = keys.filter((key) => {
    const owned = parseOwnedKey(key);
    return owned !== null && owned.generation !== generation;
  });
  if (obsolete.length)
    await dependencies.client.send("EVAL", [
      reclaimLua,
      String(obsolete.length + 1),
      dependencies.namespace.generationKey,
      ...obsolete,
      generation,
    ]);
  return next;
};
