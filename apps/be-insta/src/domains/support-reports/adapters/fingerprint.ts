import { createHash } from "node:crypto";
import type { ReportInput } from "../domain/types";
/**
 * Хеширует содержимое обращения и исходный request id в стабильном порядке для проверки
 * повторного idempotency key.
 */
export const supportFingerprint = (input: ReportInput) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        input.comment,
        input.errorCode,
        input.originalRequestId ?? null,
      ]),
    )
    .digest("hex");
