import { Result } from "@bloodyowl/boxed";
import { StoryErrorCode } from "@insta/contracts/errors";
import { storyWireLimits } from "@insta/contracts/stories";
import { storyTransport } from "../conts";
import type { StoryBackendFailure } from "../ports/types";
/** Проверяет multipart-заголовки и заявленный размер, затем ограничивает фактический поток общим лимитом файла и конверта; нарушение во время чтения завершает поток ошибкой. */
export const boundedStoryBody = (
  request: Request,
): Result<ReadableStream<Uint8Array>, StoryBackendFailure> => {
  const maximum =
    storyWireLimits.maxFileBytes + storyWireLimits.maxEnvelopeBytes;
  const declared = request.headers.get("content-length");
  if (declared && !/^\d+$/.test(declared))
    return Result.Error({
      code: StoryErrorCode.InvalidUpload,
      status: storyTransport.invalid,
    });
  if (declared && Number(declared) > maximum)
    return Result.Error({
      code: StoryErrorCode.FileTooLarge,
      status: storyTransport.tooLarge,
    });
  if (
    !request.body ||
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("multipart/form-data;")
  )
    return Result.Error({
      code: StoryErrorCode.InvalidUpload,
      status: storyTransport.invalid,
    });
  let bytes = 0;
  return Result.Ok(
    request.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        /** Учитывает каждый chunk в общем размере загрузки и передаёт его дальше только до превышения лимита конверта. */
        transform(chunk, controller) {
          bytes += chunk.byteLength;
          if (bytes > maximum) throw new Error("Upload exceeds envelope");
          controller.enqueue(chunk);
        },
      }),
    ),
  );
};
