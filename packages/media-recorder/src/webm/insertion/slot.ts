import { durationIdWidth, float32Bytes, float64Bytes } from "../conts";
import { WebmFailure } from "../failure";
import { ids } from "../layout/conts";
import type { Element, WebmLayout } from "../layout/types";
import type { DurationSlot } from "./types";

/** Подбирает размещение float64/float32 Duration внутри Void с допустимым остаточным padding; отсутствие места возвращает undefined. */
const fitVoid = (target: Element): DurationSlot | undefined => {
  for (const floatBytes of [float64Bytes, float32Bytes]) {
    for (const sizeWidth of [1, 2]) {
      const paddingBytes =
        target.end - target.start - durationIdWidth - sizeWidth - floatBytes;
      if (paddingBytes === 0 || paddingBytes >= 2)
        return { target, floatBytes, sizeWidth, paddingBytes };
    }
  }
  return undefined;
};
/** Переиспользует Duration или подходящий Void; рост Info разрешает только неиндексированному Segment неизвестного размера, иначе отклоняет layout. */
export const selectSlot = (layout: WebmLayout): DurationSlot => {
  const existing = layout.info.duration?.element;
  if (existing)
    return {
      target: existing,
      floatBytes: existing.end - existing.dataStart,
      sizeWidth: existing.dataStart - existing.sizeStart,
      paddingBytes: 0,
    };
  for (const target of layout.info.children.filter(
    (child) => child.id === ids.void,
  )) {
    const slot = fitVoid(target);
    if (slot) return slot;
  }
  if (layout.indexed || !layout.segment.unknown)
    throw new WebmFailure("unsupported-layout");
  return {
    target: undefined,
    floatBytes: float64Bytes,
    sizeWidth: 1,
    paddingBytes: 0,
  };
};
