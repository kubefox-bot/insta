import { Transform } from "node:stream";
import { StoryErrorCode } from "@insta/contracts/errors";
import { storyWireLimits } from "@insta/contracts/stories";
import { UploadRejected } from "../../../domain/upload-rejected";
/**
 * Создаёт счётчик полного multipart body, ограничивая сумму media и разрешённого envelope
 * до разбора полей.
 */
export const createEnvelopeLimit = () => {
  let bytes = 0;
  return new Transform({
    /**
     * Накапливает байты envelope и сообщает FileTooLarge через callback при превышении
     * общего wire-лимита.
     */
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.byteLength;
      callback(
        bytes > storyWireLimits.maxFileBytes + storyWireLimits.maxEnvelopeBytes
          ? new UploadRejected(StoryErrorCode.FileTooLarge)
          : null,
        chunk,
      );
    },
  });
};
