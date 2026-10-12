import type { dispatchGoal } from "@insta/fe-core/observability/analytics";
import type { CanonicalOutbox } from "./types";
export const analyticsPolicy = {
  leaseMs: 10_000,
  deadlineMs: 5000,
  retryMs: 1000,
  pollMs: 500,
  batchSize: 20,
} as const;
export const analyticsSinks = ["log_only", "otel"] as const;
export const otlpPolicy = {
  nanosecondsPerMillisecond: 1_000_000,
  spanIdHexLength: 16,
  internalSpanKind: 1,
  okStatus: 1,
} as const;

export const analyticsSinkNames = {
  logOnly: "log_only",
  otel: "otel",
} as const;
const noGoalOutcome = "no_goal";
export const dispatchSuccessStates = {
  recorded: "delivered",
  duplicate: "delivered",
  [noGoalOutcome]: "denied",
} as const satisfies Record<
  ReturnType<Awaited<ReturnType<typeof dispatchGoal>>["get"]>,
  Parameters<CanonicalOutbox["finish"]>[0]["state"]
>;
