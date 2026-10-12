import type { DeliveryRange } from "../../ports/delivery/types";
import { restoreRows } from "./restore-rows";
import type {
  DeliveryDependencies,
  OwnedRestoreInput,
  RestoreInput,
  RestoreResult,
} from "./types";

/** Проверяет snapshot/resume координаты против одного majority диапазона, не допускает future cursor. */
const matchesRange = (
  input: RestoreInput,
  range: Extract<DeliveryRange, { kind: "range" }>,
) => {
  const within =
    input.after.streamId === range.head.streamId &&
    input.after.epoch === range.head.epoch &&
    input.after.cursor >= range.after.cursor &&
    input.after.cursor <= range.head.cursor;
  if (!within) return false;
  if (!input.through) return true;
  return (
    input.through.streamId === range.head.streamId &&
    input.through.epoch === range.head.epoch &&
    input.through.cursor <= range.head.cursor
  );
};
/** Получает canonical upper bound после acquire и публикует readiness только после полного восстановления. */
export const restoreOwned = async (
  input: OwnedRestoreInput,
  ports: DeliveryDependencies,
): Promise<RestoreResult> => {
  const cancellation = input.signal ? { signal: input.signal } : {};
  const range = await ports.journal.range({
    stream: input.lease.stream,
    nowMs: ports.clock(),
    ...cancellation,
  });
  if (range.kind === "resync-required" || !matchesRange(input, range))
    return { kind: "resync-required" };
  const after = await ports.streams.begin({
    lease: input.lease,
    after: range.after,
    ...cancellation,
  });
  // Сбой после последнего XADD мог оставить tail без ready/expiry: повторяем
  // canonical H, чтобы взять его исходный deadline, а не продлить idle fallback.
  const replayAfter =
    after.cursor === range.head.cursor && after.cursor > range.after.cursor
      ? { ...after, cursor: after.cursor - 1 }
      : after;
  const result = await restoreRows(
    {
      after: replayAfter,
      head: range.head,
      lease: input.lease,
      ...cancellation,
    },
    ports,
  );
  if (result.kind === "resync-required") return result;
  await ports.streams.publishReady({
    lease: input.lease,
    head: range.head,
    expiresAt: result.expiresAt,
    ...cancellation,
  });
  return range.head;
};
