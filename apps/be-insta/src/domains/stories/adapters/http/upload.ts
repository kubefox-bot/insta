import type { Readable } from "node:stream";
import { StoryErrorCode } from "@insta/contracts/errors";
import { storyWireLimits } from "@insta/contracts/stories";
import busboy from "busboy";
import type { StoryFile } from "../../domain/types";
import { UploadRejected } from "../../domain/upload-rejected";
import { multipartLimits } from "./conts";
import { createEnvelopeLimit } from "./upload/envelope";
import { parseVideo } from "./upload/parse";
/**
 * Создаёт отложенное чтение единственного video из multipart с лимитами размера и полей.
 * До запуска проверяет abort, ошибки Busboy переводит в типизированный InvalidUpload.
 */
export const createStoryUpload =
  ({
    request,
    contentType,
  }: Readonly<{
    request: Readable;
    contentType: string | undefined;
  }>): StoryFile =>
  async (signal) => {
    if (signal.aborted)
      throw new UploadRejected(StoryErrorCode.UploadCancelled);
    try {
      const parser = busboy({
        headers: { "content-type": contentType },
        limits: {
          files: 1,
          fileSize: storyWireLimits.maxFileBytes + 1,
          fields: multipartLimits.fields,
          fieldSize: multipartLimits.fieldBytes,
          parts: multipartLimits.parts,
        },
      });
      return await parseVideo({
        request,
        parser,
        envelope: createEnvelopeLimit(),
        signal,
      });
    } catch (error) {
      if (error instanceof UploadRejected) throw error;
      throw new UploadRejected(StoryErrorCode.InvalidUpload, { cause: error });
    }
  };
