import { Result } from "@bloodyowl/boxed";
import { float32Bytes } from "./conts";
import { WebmFailure } from "./failure";
import { durationEdits, spliceBytes, verifySplice } from "./insertion/patch";
import { selectSlot } from "./insertion/slot";
import { readLayout } from "./layout/read";
import { repairedDuration } from "./provider/duration";
import type { WebmRepairError, WebmRepairInput } from "./types";

/** Восстанавливает отсутствующий/нулевой Duration в поддержанном WebM после проверки входного размера и elapsedMs; положительный Duration сохраняет исходный Blob. Проверяет неизменность остальных байтов и возвращает типизированную ошибку; это ремонт контейнера, не проверка кодеков или серверная приёмка. */
export const repairWebmDuration = async ({
  blob,
  elapsedMs,
  maxBytes,
}: WebmRepairInput): Promise<Result<Blob, WebmRepairError>> => {
  if (
    !Number.isFinite(elapsedMs) ||
    elapsedMs <= 0 ||
    blob.size === 0 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    blob.size > maxBytes
  )
    return Result.Error({ code: "invalid-input" });
  try {
    const original = new Uint8Array(await blob.arrayBuffer());
    const layout = readLayout(original);
    if (layout.info.duration && layout.info.duration.value > 0)
      return Result.Ok(blob);
    const slot = selectSlot(layout);
    const payload = repairedDuration({
      bytes: original,
      info: layout.info,
      elapsedMs,
      floatBytes: slot.floatBytes,
    });
    const edits = durationEdits({ layout, slot, payload });
    const patched = spliceBytes({ original, edits });
    verifySplice({ original, patched, edits });
    const confirmed = readLayout(patched);
    const expected =
      slot.floatBytes === float32Bytes ? Math.fround(elapsedMs) : elapsedMs;
    if (
      !Number.isFinite(expected) ||
      expected <= 0 ||
      confirmed.info.duration?.value !== expected ||
      confirmed.indexed !== layout.indexed ||
      confirmed.segment.unknown !== layout.segment.unknown
    )
      throw new WebmFailure("repair-failed");
    return Result.Ok(new Blob([patched], { type: blob.type }));
  } catch (cause) {
    return Result.Error({
      code: cause instanceof WebmFailure ? cause.code : "repair-failed",
    });
  }
};
