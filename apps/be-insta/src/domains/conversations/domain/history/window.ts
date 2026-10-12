import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode } from "@insta/contracts/errors";
import type { HistoryRange } from "./types";
/**
 * Определяет snapshot watermark и отклоняет unsafe, отрицательные или выходящие за
 * канонический lastSequence позиции cursor.
 */
export const historyWindow = ({
  range,
  lastSequence,
}: Readonly<{ range: HistoryRange; lastSequence: number }>): Result<
  Readonly<{ watermark: number }>,
  CommonErrorCode.InvalidCursor
> => {
  const watermark =
    range.direction === "recent"
      ? lastSequence
      : (range.watermark ?? lastSequence);
  if (
    !Number.isSafeInteger(watermark) ||
    watermark < 0 ||
    watermark > lastSequence
  )
    return Result.Error(CommonErrorCode.InvalidCursor);
  if (
    range.direction !== "recent" &&
    (!Number.isSafeInteger(range.sequence) ||
      range.sequence < 0 ||
      range.sequence > watermark)
  )
    return Result.Error(CommonErrorCode.InvalidCursor);
  return Result.Ok({ watermark });
};
