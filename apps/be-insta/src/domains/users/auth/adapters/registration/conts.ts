import type { deliverCode } from "../../use-cases/deliver-code";

export const deliveryHealth = {
  idle: null,
  stale: null,
  accepted: "ok",
  retry: "degraded",
  failed: "degraded",
} as const satisfies Record<
  Awaited<ReturnType<typeof deliverCode>>,
  "ok" | "degraded" | null
>;
