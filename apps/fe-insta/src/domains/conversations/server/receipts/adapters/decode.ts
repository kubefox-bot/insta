import { Result } from "@bloodyowl/boxed";
import { receiptBatchSnapshotSchema } from "@insta/contracts/messages";
import { z } from "zod";
import {
  acknowledgeReceipts200Schema,
  acknowledgeReceipts400Schema,
  acknowledgeReceipts401Schema,
} from "../../../../../lib/api/generated/schemas/acknowledgeReceiptsSchema";
import { matchesReceiptBatch } from "../../../contracts/receipts";
import { upstreamUnavailableStatus } from "../../conts";
import { receiptUnknownCode } from "../conts";
import type { ReceiptBackend } from "../types";

const failureSchema = z.union([
  acknowledgeReceipts400Schema,
  acknowledgeReceipts401Schema,
]);
/** Принимает успех только для валидного снимка того же диалога и множества message ID. Неполный или чужой снимок даёт неизвестный исход; HTTP-ошибки сохраняют Retry-After. */
export const decodeReceiptResponse = ({
  response,
  raw,
  conversationId,
  messageIds,
}: Readonly<{
  response: Response;
  raw: unknown;
  conversationId: string;
  messageIds: readonly string[];
}>): Awaited<ReturnType<ReceiptBackend>> => {
  if (!response.ok) {
    const failure = failureSchema.safeParse(raw);
    return Result.Error({
      code: failure.success ? failure.data.error.code : receiptUnknownCode,
      status: response.status,
      retryAfter: response.headers.get("Retry-After") ?? undefined,
    });
  }
  const envelope = acknowledgeReceipts200Schema.safeParse(raw);
  if (!envelope.success)
    return Result.Error({
      code: receiptUnknownCode,
      status: upstreamUnavailableStatus,
    });
  const snapshot = receiptBatchSnapshotSchema.safeParse(envelope.data.data);
  return snapshot.success &&
    matchesReceiptBatch({ snapshot: snapshot.data, conversationId, messageIds })
    ? Result.Ok(snapshot.data)
    : Result.Error({
        code: receiptUnknownCode,
        status: upstreamUnavailableStatus,
      });
};
