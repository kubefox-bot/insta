import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode, ReceiptErrorCode } from "@insta/contracts/errors";
import { receiptBatchSchema } from "@insta/contracts/messages";
import type {
  ReceiptBatchSnapshot,
  ReceiptError,
} from "../../domain/receipts/types";
import type { ReceiptDependencies, ReceiptInput } from "../../ports/receipts";
/**
 * Валидирует receipt batch, проверяет отмену вокруг quota и передаёт commit уникальные
 * messageIds с серверным временем; rate limit не изменяет receipts.
 */
export const acknowledgeReceipts = async (
  input: ReceiptInput,
  dependencies: ReceiptDependencies,
): Promise<Result<ReceiptBatchSnapshot, ReceiptError>> => {
  const parsed = receiptBatchSchema.safeParse({
    messageIds: input.messageIds,
    status: input.status,
  });
  if (!parsed.success)
    return Result.Error(ReceiptErrorCode.InvalidReceiptBatch);
  input.signal?.throwIfAborted();
  const admission = await dependencies.quota.consume(input.actorId);
  if (admission.isError())
    return Result.Error(CommonErrorCode.DependencyUnavailable);
  if (admission.get() === "limited")
    return Result.Error(ReceiptErrorCode.ReceiptsRateLimited);
  input.signal?.throwIfAborted();
  return dependencies.commitReceipts({
    ...input,
    messageIds: [...new Set(parsed.data.messageIds)],
    nowMs: dependencies.clock(),
  });
};
