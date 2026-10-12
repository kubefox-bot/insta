import { durationIdWidth } from "../conts";
import { WebmFailure } from "../failure";
import { ids, maxSizeBytes, vintBitsPerByte } from "../layout/conts";
import type { WebmLayout } from "../layout/types";
import { encodeIdentifier, encodeSize } from "./size";
import type { ByteEdit, DurationSlot } from "./types";

/** Строит EBML Void ровно заданной длины либо отклоняет размер, не представимый поддержанным заголовком. */
const padding = (length: number) => {
  if (!length) return new Uint8Array();
  for (let width = 1; width <= maxSizeBytes; width++) {
    const payloadSize = length - 1 - width;
    if (payloadSize >= 0 && payloadSize < 2 ** (width * vintBitsPerByte) - 1) {
      const bytes = new Uint8Array(length);
      bytes[0] = ids.void;
      bytes.set(encodeSize({ size: payloadSize, width }), 1);
      return bytes;
    }
  }
  throw new WebmFailure("unsupported-layout");
};
/** Вычисляет замены для Duration, сохраняя существующий заголовок или занимая Void; при добавлении обновляет размер Info, не меняя исходные bytes. */
export const durationEdits = ({
  layout,
  slot,
  payload,
}: Readonly<{
  layout: WebmLayout;
  slot: DurationSlot;
  payload: Uint8Array;
}>): readonly ByteEdit[] => {
  const headerSize = durationIdWidth + slot.sizeWidth;
  const duration = new Uint8Array(
    headerSize + payload.length + slot.paddingBytes,
  );
  duration.set(encodeIdentifier(ids.duration));
  duration.set(
    encodeSize({ size: payload.length, width: slot.sizeWidth }),
    durationIdWidth,
  );
  duration.set(payload, headerSize);
  duration.set(padding(slot.paddingBytes), headerSize + payload.length);
  if (slot.target) {
    // Existing Duration's ID/size header is retained, including nonminimal widths.
    if (slot.target.id === ids.duration)
      return [
        { start: slot.target.dataStart, end: slot.target.end, bytes: payload },
      ];
    return [
      { start: slot.target.start, end: slot.target.end, bytes: duration },
    ];
  }
  const info = layout.info.element;
  return [
    {
      start: info.sizeStart,
      end: info.dataStart,
      bytes: encodeSize({
        size: info.end - info.dataStart + duration.length,
        width: info.dataStart - info.sizeStart,
      }),
    },
    { start: info.end, end: info.end, bytes: duration },
  ];
};
/** Применяет упорядоченные непересекающиеся правки в новый массив; выход за исходные границы и обратный порядок отклоняются. */
export const spliceBytes = ({
  original,
  edits,
}: Readonly<{ original: Uint8Array; edits: readonly ByteEdit[] }>) => {
  const growth = edits.reduce(
    (total, edit) => total + edit.bytes.length - (edit.end - edit.start),
    0,
  );
  const patched = new Uint8Array(original.length + growth);
  let sourceOffset = 0;
  let targetOffset = 0;
  for (const edit of edits) {
    if (
      edit.start < sourceOffset ||
      edit.end < edit.start ||
      edit.end > original.length
    )
      throw new WebmFailure("repair-failed");
    const unchanged = original.subarray(sourceOffset, edit.start);
    patched.set(unchanged, targetOffset);
    targetOffset += unchanged.length;
    patched.set(edit.bytes, targetOffset);
    targetOffset += edit.bytes.length;
    sourceOffset = edit.end;
  }
  patched.set(original.subarray(sourceOffset), targetOffset);
  return patched;
};
/** Recheck every untouched byte, including unknown-size headers and encoded payload/config. */
export const verifySplice = ({
  original,
  patched,
  edits,
}: Readonly<{
  original: Uint8Array;
  patched: Uint8Array;
  edits: readonly ByteEdit[];
}>) => {
  let sourceOffset = 0;
  let targetOffset = 0;
  for (const edit of edits) {
    for (; sourceOffset < edit.start; sourceOffset++, targetOffset++) {
      if (original[sourceOffset] !== patched[targetOffset])
        throw new WebmFailure("repair-failed");
    }
    sourceOffset = edit.end;
    targetOffset += edit.bytes.length;
  }
  for (; sourceOffset < original.length; sourceOffset++, targetOffset++) {
    if (original[sourceOffset] !== patched[targetOffset])
      throw new WebmFailure("repair-failed");
  }
  if (targetOffset !== patched.length) throw new WebmFailure("repair-failed");
};
