import { mediaSignatures } from "./conts";
/**
 * Проверяет только начальную EBML-сигнатуру для выбора parser; корректность WebM и его
 * дорожек этим не подтверждается.
 */
export const isWebm = (bytes: Uint8Array) =>
  bytes.byteLength >= Uint32Array.BYTES_PER_ELEMENT &&
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    0,
  ) === mediaSignatures.webm;
