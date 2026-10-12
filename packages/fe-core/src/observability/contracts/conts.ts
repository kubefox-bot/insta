export const CLIENT_ERROR_STATUS = 400;
export const SERVER_ERROR_STATUS = 500;
export const SCHEMA_VERSION = 2;
export const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const TRACE_PATTERN = /^(?!0{32}$)[0-9a-f]{32}$/;
export const SPAN_PATTERN = /^(?!0{16}$)[0-9a-f]{16}$/;
export const SYMBOL_PATTERN = /^[A-Za-z][A-Za-z0-9_.:-]{0,95}$/;
export const EFFECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/;
export const canonicalCorrelation = {
  maximumLength: 128,
  pattern: /^[A-Za-z0-9_-]+$/,
} as const;
export const ROUTE_PATTERN = /^(?:\/[A-Za-z0-9_\-:[\]()*]+)*\/?$/;
export const UNKNOWN_LABEL = "unknown";
export const outcomes = [
  "attempted",
  "event",
  "succeeded",
  "rejected",
  "pending",
  "failed",
] as const;
export const logLevels = ["debug", "info", "warn", "error"] as const;
export const LEVELS = {
  attempted: "debug",
  event: "debug",
  succeeded: "info",
  rejected: "info",
  pending: "info",
  failed: "error",
} as const satisfies Record<
  (typeof outcomes)[number],
  (typeof logLevels)[number]
>;
export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;
export const SAFE_EXCEPTION = {
  type: "Error",
  message: "Error details omitted",
  truncated: true,
} as const;
export const maxRouteTemplateLength = 256;
export const minHttpStatus = 100;
export const maxHttpStatus = 599;
export const logFields = {
  schemaVersion: "schema_version",
  serviceName: "service_name",
  eventType: "event_type",
  requestId: "request_id",
  operationId: "operation_id",
  traceId: "trace_id",
  spanId: "span_id",
  resultUnknown: "result_unknown",
  durationMs: "duration_ms",
  statusCode: "status_code",
} as const;
