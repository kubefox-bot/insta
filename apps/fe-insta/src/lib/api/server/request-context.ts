import { contextHeaders } from "./conts";
import type { RequestContext } from "./types";

// This server-only context is assembled from BFF correlation and decrypted
// HttpOnly consent cookies. Optional proof is metadata, never authorization.
/**
 * Добавляет только заданные request ID, operation ID и consent proof к REST-вызову. Не
 * переносит произвольные браузерные заголовки в backend.
 */
export const requestContextHeaders = (
  context: RequestContext,
): Record<string, string> => ({
  ...(context.requestId
    ? { [contextHeaders.requestId]: context.requestId }
    : {}),
  ...(context.operationId
    ? { [contextHeaders.operationId]: context.operationId }
    : {}),
  ...(context.consentProof
    ? { [contextHeaders.consentProof]: context.consentProof }
    : {}),
});
