import type { Attempt, SupportIssue, SupportSubmission } from "./types";
/**
 * Для первой попытки фиксирует неизменяемый payload; повтор использует прежний комментарий,
 * scope и ключ, даже если форма уже изменена.
 */
export const submissionPayload = (
  input: Readonly<{
    attempt: Attempt;
    scopeId: string;
    idempotencyKey: string;
    comment: string;
    issue: SupportIssue;
  }>,
): SupportSubmission => {
  if (input.attempt.kind !== "idle") return input.attempt.payload;
  return Object.freeze({
    scopeId: input.scopeId,
    idempotencyKey: input.idempotencyKey,
    comment: input.comment,
    errorCode: input.issue.errorCode,
    ...(input.issue.originalRequestId
      ? { originalRequestId: input.issue.originalRequestId }
      : {}),
  });
};
/**
 * Требует новый scope после отказа из-за контекста или смены автора, не разрешая повтор с
 * прежней привязкой.
 */
export const needsNewScope = (attempt: Attempt) =>
  attempt.kind === "failed" &&
  (attempt.failure === "contextInvalid" || attempt.failure === "actorChanged");
