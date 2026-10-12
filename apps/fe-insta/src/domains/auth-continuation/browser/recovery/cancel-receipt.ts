import type { RecoveryDependencies } from "../../ports/recovery/types";
/** Дожидается адресной отмены и сообщает отказ существующей диагностике без изменения контракта resolve или передачи приватных данных. */
export const cancelReceipt = async (
  {
    cancel,
    onCleanupFailure,
  }: Pick<RecoveryDependencies, "cancel" | "onCleanupFailure">,
  intentId: string,
) => {
  const cancelled = await cancel(intentId).catch(() => false);
  if (!cancelled) onCleanupFailure?.();
  return cancelled;
};
