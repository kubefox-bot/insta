import type {
  CanonicalRecord,
  ConsentReference,
  GoalMapping,
  GoalProjection,
  GoalSink,
} from "@insta/fe-core/observability/analytics";
import type { Filter, ObjectId } from "mongodb";
import type { z } from "zod";
import type { canonicalSchema } from "./schema";
export type EffectContext = Readonly<{ traceId: string; spanId: string }>;
export type EffectTracer = (event: GoalProjection) => EffectContext | undefined;
export type AnalyticsSinkName = "log_only" | "otel";
export type CanonicalDocument = z.infer<typeof canonicalSchema> & {
  _id: ObjectId | string;
};
export type AnalyticsClaim = Readonly<{
  id: ObjectId | string;
  record: CanonicalRecord;
  mapping: GoalMapping;
  sink: AnalyticsSinkName;
  leaseId: string;
}>;
export type CanonicalOutbox = Readonly<{
  claim: (
    input: Readonly<{ sink: AnalyticsSinkName; now: number; leaseId: string }>,
  ) => Promise<AnalyticsClaim | null>;
  finish: (
    input: Readonly<{
      claim: AnalyticsClaim;
      state: "delivered" | "denied";
      now: number;
    }>,
  ) => Promise<boolean>;
  retry: (
    input: Readonly<{ claim: AnalyticsClaim; now: number }>,
  ) => Promise<void>;
}>;
export type OutboxScope = Filter<CanonicalDocument>;
export type AnalyticsWorkerOptions = Readonly<{
  outboxes: readonly CanonicalOutbox[];
  sinks: Readonly<Partial<Record<AnalyticsSinkName, GoalSink>>>;
  permission: (
    reference: ConsentReference,
  ) => Promise<"allowed" | "denied" | "unavailable">;
  clock: () => number;
  onError: () => void;
}>;
