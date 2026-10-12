import { ebmlEncoding, laceEncoding, laceMode } from "./conts";
import { readVint } from "./reader";

/** Читает продолженный Xiph-размер до завершающего байта, отклоняя обрыв заголовка lace. */
const readXiphSize = ({
  bytes,
  at,
  end,
}: Readonly<{ bytes: Uint8Array; at: number; end: number }>) => {
  let next = at;
  let size = 0;
  let part: number = laceEncoding.continuedSize;
  while (part === laceEncoding.continuedSize) {
    if (next >= end) throw Error("Truncated Xiph lace");
    part = bytes[next++] ?? 0;
    size += part;
  }
  return { next, size };
};
/**
 * Читает первый EBML-размер либо signed delta к предыдущему frame size; unknown marker и
 * небезопасные числа отклоняет.
 */
const readEbmlSize = ({
  bytes,
  at,
  end,
  previous,
}: Readonly<{
  bytes: Uint8Array;
  at: number;
  end: number;
  previous: number | undefined;
}>) => {
  const value = readVint({ bytes, at, end });
  if (value.unknown || value.value > BigInt(Number.MAX_SAFE_INTEGER))
    throw Error("Invalid EBML lace");
  if (previous === undefined)
    return { next: at + value.width, size: Number(value.value) };
  const bias =
    (1n << BigInt(ebmlEncoding.valueBitsPerByte * value.width - 1)) - 1n;
  return {
    next: at + value.width,
    size: previous + Number(value.value - bias),
  };
};
/**
 * Восстанавливает размеры fixed/Xiph/EBML laces; последний размер выводит из остатка
 * block, требуя делимость для fixed режима.
 */
const readSizes = ({
  bytes,
  start,
  end,
  mode,
  count,
}: Readonly<{
  bytes: Uint8Array;
  start: number;
  end: number;
  mode: number;
  count: number;
}>) => {
  if (mode === laceMode.fixed) {
    if ((end - start) % count !== 0) throw Error("Fixed lace remainder");
    return {
      at: start,
      sizes: Array<number>(count).fill((end - start) / count),
    };
  }
  const sizes: number[] = [];
  let at = start;
  for (let index = 0; index < count - 1; index++) {
    const value =
      mode === laceMode.xiph
        ? readXiphSize({ bytes, at, end })
        : readEbmlSize({ bytes, at, end, previous: sizes.at(-1) });
    at = value.next;
    sizes.push(value.size);
  }
  sizes.push(end - at - sizes.reduce((sum, size) => sum + size, 0));
  return { at, sizes };
};
/**
 * Разделяет block на непустые кадры с проверкой границ и safe sizes. Возвращает subarray
 * views исходных байтов, не независимые копии.
 */
export const splitLaces = ({
  bytes,
  start,
  end,
  mode,
}: Readonly<{
  bytes: Uint8Array;
  start: number;
  end: number;
  mode: number;
}>): readonly Uint8Array[] => {
  if (start >= end) throw Error("Empty block");
  if (mode === laceMode.none) return [bytes.subarray(start, end)];
  const count = (bytes[start] ?? 0) + 1;
  if (count < laceEncoding.minimumFrames) throw Error("Invalid lace count");
  const parsed = readSizes({ bytes, start: start + 1, end, mode, count });
  let at = parsed.at;
  return parsed.sizes.map((size) => {
    if (!Number.isSafeInteger(size) || size <= 0 || at + size > end)
      throw Error("Lace bounds");
    const frame = bytes.subarray(at, at + size);
    at += size;
    return frame;
  });
};
