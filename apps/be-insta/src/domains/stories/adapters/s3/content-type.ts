import { isWebm } from "../media/container";
import { storagePolicy } from "./conts";
// Metadata hint at PUT only; publication still reads and validates stored bytes.
/**
 * Выбирает WebM либо MP4 metadata hint по сигнатуре байтов; это не заменяет последующую
 * проверку контейнера, кодеков и длительности.
 */
export const storedContentType = (bytes: Uint8Array) =>
  isWebm(bytes) ? storagePolicy.webmContentType : storagePolicy.contentType;
