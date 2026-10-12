import type { RedisClient } from "bun";
import { z } from "zod";
import { deleteRetiredKeys } from "../../../../../../lib/dragonfly/index";
import { registrationQueue } from "./conts";
// Only this capability's retired generation keys. Current-generation fencing is
// checked atomically with each deletion; no active queue or another owner is touched.
/**
 * Сканирует registration-ключи старых корректно оформленных поколений и удаляет их через
 * fenced cleanup; текущее поколение и неизвестные владельцы сохраняются.
 */
export const retireRegistrationQueues = async ({
  client,
  generation,
  namespace,
}: Readonly<{
  client: RedisClient;
  generation: string;
  namespace: string;
}>) => {
  let cursor = "0";
  do {
    const page = z
      .tuple([z.string(), z.array(z.string())])
      .parse(
        await client.send("SCAN", [
          cursor,
          "MATCH",
          `auth:*:${namespace}:*`,
          "COUNT",
          String(registrationQueue.retireScanCount),
        ]),
      );
    cursor = page[0];
    for (const key of page[1]) {
      const boundary = key.indexOf(`:${namespace}:`);
      const owner = key.slice("auth:".length, boundary);
      if (
        boundary < 0 ||
        owner === generation ||
        !/^[a-f0-9]{40}:[a-f0-9-]{36}$/.test(owner)
      )
        continue;
      await deleteRetiredKeys({
        client,
        generation,
        retiredGeneration: owner,
        namespace,
        keys: [key.slice(`auth:${owner}:`.length)],
      });
    }
  } while (cursor !== "0");
};
