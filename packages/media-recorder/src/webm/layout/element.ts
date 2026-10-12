import { WebmFailure } from "../failure";
import {
  bitsPerByte,
  byteRadix,
  leadingByteZeroOffset,
  maxIdBytes,
  maxSizeBytes,
  vintBitsPerByte,
} from "./conts";
import type { Element } from "./types";

/** Определяет ширину EBML vint по первому байту и проверяет доступность заголовка в заданных границах. */
const widthAt = ({
  bytes,
  start,
  end,
  max,
}: Readonly<{
  bytes: Uint8Array;
  start: number;
  end: number;
  max: number;
}>) => {
  const first = bytes[start];
  if (first === undefined || first === 0)
    throw new WebmFailure("invalid-layout");
  const width = Math.clz32(first) - leadingByteZeroOffset;
  if (width > max || start + width > end)
    throw new WebmFailure("invalid-layout");
  return width;
};
/** Читает ID и size элемента в ограниченном диапазоне; неизвестный размер охватывает остаток, конечный не может выйти за end. */
export const readElement = ({
  bytes,
  start,
  end,
}: Readonly<{
  bytes: Uint8Array;
  start: number;
  end: number;
}>): Element => {
  const idWidth = widthAt({ bytes, start, end, max: maxIdBytes });
  const sizeStart = start + idWidth;
  const sizeWidth = widthAt({
    bytes,
    start: sizeStart,
    end,
    max: maxSizeBytes,
  });
  const dataStart = sizeStart + sizeWidth;
  const id = bytes
    .subarray(start, sizeStart)
    .reduce((value, byte) => value * byteRadix + byte, 0);
  const firstSizeByte = bytes[sizeStart];
  if (firstSizeByte === undefined) throw new WebmFailure("invalid-layout");
  const marker = 2 ** (bitsPerByte - sizeWidth);
  let size = BigInt(firstSizeByte & (marker - 1));
  for (const byte of bytes.subarray(sizeStart + 1, dataStart))
    size = size * BigInt(byteRadix) + BigInt(byte);
  const unknown = size === (1n << BigInt(sizeWidth * vintBitsPerByte)) - 1n;
  if (!unknown && size > BigInt(end - dataStart))
    throw new WebmFailure("invalid-layout");
  return {
    id,
    start,
    sizeStart,
    dataStart,
    end: unknown ? end : dataStart + Number(size),
    unknown,
  };
};
/** Собирает непосредственных детей контейнера, требуя конечный размер каждого; исходные bytes остаются заимствованными. */
export const finiteChildren = ({
  bytes,
  parent,
}: Readonly<{ bytes: Uint8Array; parent: Element }>) => {
  const children: Element[] = [];
  for (let offset = parent.dataStart; offset < parent.end; ) {
    const child = readElement({ bytes, start: offset, end: parent.end });
    if (child.unknown) throw new WebmFailure("unsupported-layout");
    children.push(child);
    offset = child.end;
  }
  return children;
};
