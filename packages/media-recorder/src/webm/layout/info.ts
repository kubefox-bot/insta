import { float32Bytes, float64Bytes, nativeTimestampScaleNs } from "../conts";
import { WebmFailure } from "../failure";
import {
  byteRadix,
  ids,
  infoChildIds,
  maxInfoBytes,
  maxSizeBytes,
} from "./conts";
import { finiteChildren } from "./element";
import type { Element, InfoLayout } from "./types";

/** Требует единственный TimestampScale поддержанной ширины и нативного масштаба; иной layout для ремонта отклоняется. */
const validateScale = ({
  bytes,
  children,
}: Readonly<{ bytes: Uint8Array; children: readonly Element[] }>) => {
  const scales = children.filter((child) => child.id === ids.scale);
  const scale = scales[0];
  if (
    scales.length !== 1 ||
    !scale ||
    scale.end - scale.dataStart > maxSizeBytes
  )
    throw new WebmFailure("unsupported-layout");
  const scaleNs = bytes
    .subarray(scale.dataStart, scale.end)
    .reduce((value, byte) => value * byteRadix + byte, 0);
  if (scaleNs !== nativeTimestampScaleNs)
    throw new WebmFailure("unsupported-layout");
};
/** Читает необязательный единственный Duration как float32/float64; дубликат, неверный размер, отрицательное или нечисловое значение отклоняет. */
const readDuration = ({
  bytes,
  children,
}: Readonly<{
  bytes: Uint8Array;
  children: readonly Element[];
}>): InfoLayout["duration"] => {
  const durations = children.filter((child) => child.id === ids.duration);
  if (durations.length > 1) throw new WebmFailure("invalid-layout");
  const element = durations[0];
  if (!element) return undefined;
  const size = element.end - element.dataStart;
  if (size !== float32Bytes && size !== float64Bytes)
    throw new WebmFailure("invalid-layout");
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset + element.dataStart,
    size,
  );
  const value = size === float32Bytes ? view.getFloat32(0) : view.getFloat64(0);
  if (!Number.isFinite(value) || value < 0)
    throw new WebmFailure("invalid-layout");
  return { element, value };
};
/** Проверяет ограниченный конечный Info и разрешённые child IDs, затем извлекает масштаб и Duration; это не декодирование медиаданных. */
export const readInfo = ({
  bytes,
  element,
}: Readonly<{ bytes: Uint8Array; element: Element }>): InfoLayout => {
  if (element.unknown || element.end - element.dataStart > maxInfoBytes)
    throw new WebmFailure("unsupported-layout");
  const children = finiteChildren({ bytes, parent: element });
  if (children.some((child) => !infoChildIds.includes(child.id)))
    throw new WebmFailure("unsupported-layout");
  validateScale({ bytes, children });
  return { element, children, duration: readDuration({ bytes, children }) };
};
