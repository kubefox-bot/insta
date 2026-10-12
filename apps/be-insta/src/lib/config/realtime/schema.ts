import { maxUnreadBatchSize } from "@insta/contracts/realtime";
import { z } from "zod";
import { realtimeConfigLimits, realtimeDefaults } from "./conts";

/** Создаёт валидатор положительного целого с явным верхним пределом для настройки доставки. */
const positiveInteger = (maximum: number) =>
  z.coerce.number().int().positive().max(maximum);
const timerDelay = positiveInteger(realtimeConfigLimits.maxTimerDelayMs);
export const realtimeConfigSchema = z
  .strictObject({
    retentionMs: timerDelay.default(realtimeDefaults.retentionMs),
    ackTimeoutMs: timerDelay.default(realtimeDefaults.ackTimeoutMs),
    replayPageSize: positiveInteger(
      realtimeConfigLimits.maxReplayPageSize,
    ).default(realtimeDefaults.replayPageSize),
    maxUnreadBatchSize: positiveInteger(maxUnreadBatchSize).default(
      realtimeDefaults.maxUnreadBatchSize,
    ),
    maxApplyFailures: positiveInteger(
      realtimeConfigLimits.maxApplyFailures,
    ).default(realtimeDefaults.maxApplyFailures),
    deliveryRetryBaseMs: timerDelay.default(
      realtimeDefaults.deliveryRetryBaseMs,
    ),
    deliveryRetryCapMs: timerDelay.default(realtimeDefaults.deliveryRetryCapMs),
    maxSubscriptionsPerSocket: positiveInteger(
      realtimeConfigLimits.maxSubscriptionsPerSocket,
    ).default(realtimeDefaults.maxSubscriptionsPerSocket),
  })
  .refine((value) => value.deliveryRetryBaseMs <= value.deliveryRetryCapMs, {
    path: ["deliveryRetryBaseMs"],
    message: "Retry base must not exceed retry cap",
  })
  .refine(
    (value) => {
      const expiresAt = Date.now() + value.retentionMs;
      return (
        Number.isSafeInteger(expiresAt) &&
        expiresAt <= realtimeConfigLimits.maximumDateMs
      );
    },
    {
      path: ["retentionMs"],
      message: "Retention expiry must be a supported safe timestamp",
    },
  );
