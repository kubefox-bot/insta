import { z } from "zod";
import { storyWireLimits } from "./conts";
export const storyPolicySchema = z.strictObject({
  maxDurationMs: z
    .number()
    .int()
    .min(storyWireLimits.captureSafetyMarginMs + 1)
    .max(storyWireLimits.maxDurationMs),
  lifetimeMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  maxFileBytes: z.literal(storyWireLimits.maxFileBytes),
  captureSafetyMarginMs: z.literal(storyWireLimits.captureSafetyMarginMs),
});
