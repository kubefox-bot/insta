import { ebmlEncoding } from "./conts";
import type { Element } from "./types";

/**
 * Разбирает ограниченный EBML VINT с сохранением bigint; для размеров распознаёт unknown
 * marker, для ID сохраняет marker bits.
 */
export const readVint = ({
  bytes,
  at,
  end,
  id = false,
}: Readonly<{ bytes: Uint8Array; at: number; end: number; id?: boolean }>) => {
  const first = bytes[at];
  if (!first || at >= end) throw Error("Invalid EBML integer");
  let width = 1;
  let mask = ebmlEncoding.marker;
  while (!(first & mask)) {
    width++;
    mask >>= 1;
  }
  if (
    width > (id ? ebmlEncoding.maxIdBytes : ebmlEncoding.maxSizeBytes) ||
    at + width > end
  )
    throw Error("Truncated EBML integer");
  let value = BigInt(id ? first : first & (mask - 1));
  for (const byte of bytes.subarray(at + 1, at + width))
    value = (value << BigInt(ebmlEncoding.bitsPerByte)) | BigInt(byte);
  return {
    width,
    value,
    unknown:
      !id &&
      value === (1n << BigInt(ebmlEncoding.valueBitsPerByte * width)) - 1n,
  };
};
/** Читает EBML uint допустимой ширины в bigint без потери точности TrackUID. */
export const readUnsignedBigInt = (
  bytes: Uint8Array,
  element: Pick<Element, "data" | "end">,
): bigint => {
  if (
    element.end - element.data < 1 ||
    element.end - element.data > ebmlEncoding.maxSizeBytes
  )
    throw Error("Invalid EBML uint");
  let result = 0n;
  for (let at = element.data; at < element.end; at++)
    result = result * BigInt(ebmlEncoding.radix) + BigInt(bytes[at] ?? 0);
  return result;
};
/**
 * Преобразует EBML uint в number только в пределах safe integer, иначе отклоняет
 * overflow.
 */
export const readUnsigned = (
  bytes: Uint8Array,
  element: Pick<Element, "data" | "end">,
): number => {
  const result = readUnsignedBigInt(bytes, element);
  if (result > BigInt(Number.MAX_SAFE_INTEGER))
    throw Error("EBML integer overflow");
  return Number(result);
};
/**
 * Читает только 32/64-битный конечный EBML float; NaN, infinity и неверную ширину
 * отклоняет.
 */
export const readFloat = (
  bytes: Uint8Array,
  element: Pick<Element, "data" | "end">,
) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = element.end - element.data;
  if (size !== ebmlEncoding.float32Bytes && size !== ebmlEncoding.float64Bytes)
    throw Error("Invalid EBML float");
  const value =
    size === ebmlEncoding.float32Bytes
      ? view.getFloat32(element.data)
      : view.getFloat64(element.data);
  if (!Number.isFinite(value)) throw Error("Nonfinite EBML float");
  return value;
};
/**
 * Возвращает обязательный дочерний элемент по ID либо сообщает его отсутствие;
 * уникальность обеспечивает владелец разбора scope.
 */
export const one = (nodes: readonly Element[], id: number) => {
  const node = nodes.find((node) => node.id === id);
  if (!node)
    throw Error(`Missing EBML element ${id.toString(ebmlEncoding.hexRadix)}`);
  return node;
};
