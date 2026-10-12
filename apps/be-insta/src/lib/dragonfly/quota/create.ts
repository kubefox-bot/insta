import { createHmac } from "node:crypto";
import { Result } from "@bloodyowl/boxed";
import type { RedisClient } from "bun";
import { readGeneration } from "../generation";
import { quotaWindowMs } from "./conts";
import { incrementWindow } from "./increment";

/** Создаёт квоту актёра с HMAC-идентификаторами и generation fencing; не владеет lifecycle клиента. */
export const createActorQuota = ({
  client,
  key,
  namespace,
  maximum,
}: Readonly<{
  client: RedisClient;
  key: string;
  namespace: string;
  maximum: number;
}>) => ({
  /** Увеличивает счётчик окна; различает превышение лимита и недоступность брокера, не раскрывая actorId в ключе. */
  consume: async (
    actorId: string,
  ): Promise<Result<"allowed" | "limited", "unavailable">> => {
    try {
      const generation = await readGeneration(client);
      const identity = createHmac("sha256", Buffer.from(key, "hex"))
        .update(actorId)
        .digest("hex");
      const { count } = await incrementWindow({
        client,
        generation,
        key: `${namespace}:limit:${identity}`,
        windowMs: quotaWindowMs,
      });
      return Result.Ok(count > maximum ? "limited" : "allowed");
    } catch {
      return Result.Error("unavailable");
    }
  },
});
