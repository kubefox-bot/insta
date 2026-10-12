import type { Result } from "@bloodyowl/boxed";
export type ConsentReference = Readonly<{
  contextId: string;
  revision: number;
  policyVersion: number;
  generation: string;
}>;
export type CanonicalRecord = Readonly<{
  analyticsEventId: string;
  effectId: string;
  operationId: string;
  operation: string;
  code: string;
  authority: "server_canonical" | "client_observed";
  occurredAt: number;
  reference?: ConsentReference;
}>;
export type GoalMapping = Readonly<{
  operation: string;
  successCodes: readonly string[];
  authority: "server_canonical";
  goal: string | null;
}>;
export type GoalProjection = Readonly<{
  analyticsEventId: string;
  effectId: string;
  operationId: string;
  operation: string;
  code: string;
  authority: "server_canonical";
  occurredAt: number;
  goal: string;
}>;
export type DispatchError =
  | "permission_unavailable"
  | "sink_unavailable"
  | "claim_unavailable";
export type GoalSink = Readonly<{
  name: string;
  record: (
    event: GoalProjection,
    signal?: AbortSignal,
  ) => Promise<Result<"recorded" | "duplicate", "sink_unavailable">>;
}>;
export type GoalClaims = Readonly<{
  has: (key: string) => Promise<boolean>;
  save: (key: string) => Promise<void>;
}>;
export type GoalDispatch = Readonly<{
  record: CanonicalRecord;
  mapping: GoalMapping;
  sink: GoalSink;
  permission: (
    reference: ConsentReference,
  ) => Promise<"allowed" | "denied" | "unavailable">;
  claims?: GoalClaims;
  signal?: AbortSignal;
}>;
