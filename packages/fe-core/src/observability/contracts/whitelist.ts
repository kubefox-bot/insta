import { z } from "zod";
import { requestIdSchema } from "../identifiers/schema";
import {
  HTTP_METHODS,
  LEVELS,
  logFields,
  logLevels,
  maxHttpStatus,
  maxRouteTemplateLength,
  minHttpStatus,
  outcomes,
  ROUTE_PATTERN,
  SAFE_EXCEPTION,
  SCHEMA_VERSION,
  SPAN_PATTERN,
  SYMBOL_PATTERN,
  TRACE_PATTERN,
  UNKNOWN_LABEL,
  UUID_V4_PATTERN,
} from "./conts";
import {
  analyticsProjectionSchema,
  clientProjectionSchema,
} from "./projections";
import type { ClientProjection, Identity, LogRecord } from "./types";

const symbol = z.string().regex(SYMBOL_PATTERN).catch(UNKNOWN_LABEL);
const correlation = z.object({
  [logFields.requestId]: requestIdSchema.optional().catch(undefined),
  [logFields.operationId]: z
    .string()
    .regex(UUID_V4_PATTERN)
    .optional()
    .catch(undefined),
  [logFields.traceId]: z
    .string()
    .regex(TRACE_PATTERN)
    .optional()
    .catch(undefined),
  [logFields.spanId]: z
    .string()
    .regex(SPAN_PATTERN)
    .optional()
    .catch(undefined),
});
const business = z.object({
  operation: symbol,
  [logFields.durationMs]: z
    .number()
    .finite()
    .nonnegative()
    .optional()
    .catch(undefined),
  outcome: z.enum(outcomes).catch("failed"),
  authority: z
    .enum(["server_canonical", "client_observed"])
    .catch("server_canonical"),
  code: symbol.optional(),
  retryable: z.boolean().optional(),
  [logFields.resultUnknown]: z.boolean().optional(),
});
const http = z.object({
  method: z.enum(HTTP_METHODS).optional().catch(undefined),
  route: z
    .string()
    .max(maxRouteTemplateLength)
    .regex(ROUTE_PATTERN)
    .optional()
    .catch(undefined),
  [logFields.statusCode]: z
    .number()
    .int()
    .min(minHttpStatus)
    .max(maxHttpStatus)
    .optional()
    .catch(undefined),
  [logFields.durationMs]: z
    .number()
    .finite()
    .nonnegative()
    .optional()
    .catch(undefined),
});
const schema = correlation.extend({
  [logFields.eventType]: z
    .enum([
      "http_request",
      "business_operation",
      "exception",
      "diagnostic",
      "system",
      "analytics",
      "client_observed",
    ])
    .catch("system"),
  level: z.enum(logLevels).catch("info"),
  business: business.optional().catch(undefined),
  analytics: analyticsProjectionSchema.optional().catch(undefined),
  client: clientProjectionSchema.optional().catch(undefined),
  http: http.optional().catch(undefined),
  exception: z.unknown().optional(),
  diagnostic: z.object({ code: symbol }).optional().catch(undefined),
});
/** Проверяет и проецирует вход по allowlist, закрепляя identity владельца; исключает неизвестные поля и заменяет exception безопасным шаблоном. Analytics/client разрешены только своему event_type, уровень business определяется outcome; корневые ошибки схемы выбрасываются. */
export const whitelistRecord = ({
  input,
  identity,
}: Readonly<{ input: unknown; identity: Identity }>): LogRecord &
  Readonly<{ client?: ClientProjection }> => {
  const parsed = schema.parse(input);
  const { analytics, client, ...operational } = parsed;
  const acceptedIdentity = z
    .object({ app: symbol, [logFields.serviceName]: symbol, source: symbol })
    .parse(identity);
  return {
    [logFields.schemaVersion]: SCHEMA_VERSION,
    ...acceptedIdentity,
    ...operational,
    ...(operational.event_type === "analytics" && analytics
      ? { analytics }
      : {}),
    ...(operational.event_type === "client_observed" && client
      ? { client }
      : {}),
    ...(parsed.business
      ? { business: parsed.business, level: LEVELS[parsed.business.outcome] }
      : {}),
    ...(parsed.exception !== undefined
      ? { exception: { ...SAFE_EXCEPTION } }
      : {}),
  };
};
