export const requestLimits = {
  jsonBytes: 65536,
  headerBytes: 16384,
  multipartBytes: 22020096,
} as const;
export const httpHeaders = {
  requestId: "x-request-id",
  operationId: "x-operation-id",
  idempotencyKey: "x-idempotency-key",
} as const;
export const httpHeaderNames = {
  authorization: "Authorization",
  requestId: "X-Request-ID",
  operationId: "X-Operation-ID",
  idempotencyKey: "X-Idempotency-Key",
} as const;
export const readinessTiming = {
  optionalMailProbeMs: 500,
  minimumBffApiTimeoutMs: 1000,
} as const;
