import type { DragonflyNamespace } from "@insta/fe-core/dragonfly/server";
import type { RedisClient } from "bun";
export type DeliveryProbe = Readonly<{
  open: () => RedisClient;
  authIdentity: string;
  namespace: DragonflyNamespace;
  timeoutMs: number;
}>;
export type Readiness = Readonly<{
  checkRequired: () => Promise<boolean>;
  check: () => Promise<
    Readonly<{
      ready: boolean;
      mail: "ok" | "degraded";
      delivery: "ok" | "degraded";
    }>
  >;
}>;
