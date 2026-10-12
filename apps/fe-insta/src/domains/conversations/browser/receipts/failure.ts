import { readRetryAfter } from "../lib/http/retry-after";
import {
  receiptRateLimitedStatus,
  receiptServerFailureStatus,
  receiptTransportCodes,
} from "./conts";
import { ReceiptRequestError } from "./error";
import type { ReceiptFailure } from "./types";
/** Считает неизвестное исключение неопределённым повторяемым исходом; HTTP 429 и 5xx повторяет с Retry-After, остальные HTTP отказы завершает. */
export const receiptFailure = ({
  error,
  now,
}: Readonly<{ error: unknown; now: number }>): ReceiptFailure => {
  if (!(error instanceof ReceiptRequestError))
    return { kind: "retry", code: receiptTransportCodes.unknownOutcome };
  return {
    kind:
      error.status === receiptRateLimitedStatus ||
      error.status >= receiptServerFailureStatus
        ? "retry"
        : "terminal",
    code: error.code,
    retryAfterMs: readRetryAfter({ header: error.retryAfter ?? null, now }),
  };
};
