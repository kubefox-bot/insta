import { requestStreamCancellation } from "../../streams/server/index";

/**
 * Читает тело с лимитом байт и таймером; при превышении просит отмену и выбрасывает
 * RangeError либо TimeoutError. Владеет reader lock и таймером, освобождая их в finally;
 * отсутствие тела даёт пустую строку.
 */
export const readResponse = async ({
  response,
  maxResponseBytes,
  timeoutMs,
}: {
  readonly response: Response;
  readonly maxResponseBytes: number;
  readonly timeoutMs: number;
}) => {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    requestStreamCancellation(reader);
  }, timeoutMs);
  try {
    while (true) {
      const chunk = await reader.read();
      if (timedOut)
        throw new DOMException("Response body timeout", "TimeoutError");
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > maxResponseBytes) {
        requestStreamCancellation(reader);
        throw new RangeError("Response too large");
      }
      chunks.push(chunk.value);
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
};
