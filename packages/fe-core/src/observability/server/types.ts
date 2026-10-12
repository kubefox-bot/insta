import type { DestinationStream, Logger } from "pino";
import type { ClientProjection, Identity, LogRecord } from "../contracts/types";
export type TechnicalContext = Readonly<{
  requestId?: string;
  operationId?: string;
  traceId?: string;
  spanId?: string;
}>;
export type ScopeContext = Readonly<
  Pick<TechnicalContext, "requestId" | "operationId">
>;
export type PinoAdapter = Readonly<{
  logger: Logger;
  emit(record: LogRecord): void;
  close(): Promise<"flushed" | "failed" | "timeout">;
}>;
export type PinoAdapterOptions = Readonly<{
  identity: Identity;
  level?: "debug" | "info" | "warn" | "error";
  destination?: DestinationStream;
  flushTimeoutMs?: number;
  resolveClientGoal?: (event: ClientProjection) => string | undefined;
}>;
export type TracingOptions = Readonly<{
  readPermission?: () => "allowed" | "denied";
}>;
export type EffectContextInput = Readonly<{
  permission: "allowed" | "denied";
  name: string;
  occurredAt: number;
}>;
