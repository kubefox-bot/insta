import { WebmFailure } from "../failure";
import {
  bitsPerByte,
  byteMask,
  maxSizeBytes,
  vintBitsPerByte,
} from "../layout/conts";

/** Кодирует конечный EBML size заданной ширины; отклоняет переполнение, unsafe integer и зарезервированное значение неизвестного размера. */
export const encodeSize = ({
  size,
  width,
}: Readonly<{ size: number; width: number }>) => {
  if (
    width < 1 ||
    width > maxSizeBytes ||
    !Number.isSafeInteger(size) ||
    size < 0 ||
    BigInt(size) >= (1n << BigInt(width * vintBitsPerByte)) - 1n
  )
    throw new WebmFailure("unsupported-layout");
  const bytes = new Uint8Array(width);
  let encoded = BigInt(size) | (1n << BigInt(width * vintBitsPerByte));
  for (let index = width - 1; index >= 0; index--) {
    bytes[index] = Number(encoded & BigInt(byteMask));
    encoded >>= BigInt(bitsPerByte);
  }
  return bytes;
};

/** Переводит числовой идентификатор EBML в последовательность байтов от старшего к младшему. */
export const encodeIdentifier = (identifier: number) => {
  const bytes: number[] = [];
  for (let value = identifier; value > 0; value >>>= bitsPerByte)
    bytes.unshift(value & byteMask);
  return new Uint8Array(bytes);
};
