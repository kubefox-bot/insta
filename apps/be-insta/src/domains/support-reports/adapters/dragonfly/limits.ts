import { createHmac } from "node:crypto";
import { Result } from "@bloodyowl/boxed";
import { SupportErrorCode } from "@insta/contracts/errors";
import type { RedisClient } from "bun";
import { supportPolicy } from "../../domain/conts";
import type { Limits } from "../../ports/limits";
import { consumeSupportQuota } from "./quota";
/**
 * Подключает квоты support к заимствованному Redis и ключу HMAC, не сохраняя открытые
 * идентификаторы источников в ключах.
 */
export const createSupportLimits = ({
  client,
  key,
  namespace = "support",
}: Readonly<{
  client: RedisClient;
  key: string;
  namespace?: string;
}>): Limits => ({
  /**
   * Хеширует субъект, расходует квоту выбранного вида и сравнивает счётчик с его лимитом;
   * сбой возвращает support unavailable.
   */
  consume: async ({ kind, subject }) => {
    try {
      const digest = createHmac("sha256", Buffer.from(key, "hex"))
        .update(subject)
        .digest("hex");
      const maximum = {
        owner: supportPolicy.ownerMaximum,
        ip: supportPolicy.ipMaximum,
        context: supportPolicy.contextMaximum,
      }[kind];
      const count = await consumeSupportQuota({
        client,
        identity: `${namespace}:limit:${kind}:${digest}`,
      });
      return Result.Ok(count > maximum ? "limited" : "allowed");
    } catch {
      return Result.Error(SupportErrorCode.SupportUnavailable);
    }
  },
});
