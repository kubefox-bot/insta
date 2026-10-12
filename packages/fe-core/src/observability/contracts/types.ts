import type { z } from "zod";
import type { logLevels, outcomes, SCHEMA_VERSION } from "./conts";
import type { clientProjectionSchema } from "./projections";
export type ClientProjection = Readonly<z.infer<typeof clientProjectionSchema>>;
export type Correlation = Readonly<
  Partial<
    Record<
      "request_id" | "operation_id" | "trace_id" | "span_id",
      string | undefined
    >
  >
>;
export type Identity = Readonly<{ app: string; source: string }> &
  Readonly<Record<"service_name", string>>;
export type Result = Readonly<{ code: string; retryable: boolean }> &
  Readonly<Record<"result_unknown", boolean>>;
export type Level = (typeof logLevels)[number];
export type Outcome = (typeof outcomes)[number];
export type LogRecord = Identity &
  Correlation &
  Readonly<Record<"schema_version", typeof SCHEMA_VERSION>> &
  Readonly<Record<"event_type", string>> &
  Readonly<{ level: Level; [key: string]: unknown }>;
export type Adapter =
  | Readonly<{ emit(record: LogRecord): void | Promise<void> }>
  | ((record: LogRecord) => void | Promise<void>);
