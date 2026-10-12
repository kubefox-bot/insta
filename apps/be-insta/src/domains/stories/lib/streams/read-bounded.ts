import { Result } from "@bloodyowl/boxed";
import { StoryErrorCode } from "@insta/contracts/errors";
import { storyWireLimits } from "@insta/contracts/stories";
import { z } from "zod";
import { bindCancellation } from "./cancellation";
/**
 * Собирает собственную копию байтов в пределах wire-лимита, отменяя поток при превышении.
 * На всех исходах ждёт отмену и освобождает reader lock; I/O-ошибки не превращает в
 * пустые данные.
 */
export const readBounded = async ({
  source,
  maxBytes,
  signal,
}: Readonly<{
  source: ReadableStream<Uint8Array>;
  maxBytes: number;
  signal: AbortSignal;
}>): Promise<
  Result<Uint8Array<ArrayBuffer>, StoryErrorCode.FileTooLarge | "ABORTED">
> => {
  z.number().int().positive().max(storyWireLimits.maxFileBytes).parse(maxBytes);
  const reader = source.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const releaseCancellation = bindCancellation({ reader, signal });
  try {
    while (true) {
      const next = await reader.read();
      if (signal.aborted) return Result.Error("ABORTED");
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        return Result.Error(StoryErrorCode.FileTooLarge);
      }
      chunks.push(next.value.slice());
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return Result.Ok(bytes);
  } finally {
    try {
      await releaseCancellation();
    } finally {
      reader.releaseLock();
    }
  }
};
