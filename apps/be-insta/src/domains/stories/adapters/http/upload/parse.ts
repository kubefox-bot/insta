import type { Readable, Transform } from "node:stream";
import { StoryErrorCode } from "@insta/contracts/errors";
import type { Busboy } from "busboy";
import type { StoryFile } from "../../../domain/types";
import { UploadRejected } from "../../../domain/upload-rejected";
import { videoStream } from "./video";
/**
 * Подключает multipart pipeline и выдаёт поток единственного поля video отдельно от
 * завершения envelope. Лимиты, abort и ошибки отклоняют ещё не завершённые promises;
 * после выдачи потока отказ сообщается через complete/stream. Listeners запроса
 * снимаются при закрытии parser.
 */
export const parseVideo = ({
  request,
  parser,
  envelope,
  signal,
}: Readonly<{
  request: Readable;
  parser: Busboy;
  envelope: Transform;
  signal: AbortSignal;
}>): ReturnType<StoryFile> => {
  const ready = Promise.withResolvers<Awaited<ReturnType<StoryFile>>>();
  const completed = Promise.withResolvers<void>();
  completed.promise.catch(() => undefined);
  let video: Readable | undefined;
  /**
   * Отклоняет ещё не завершённые promises; после выдачи потока сообщает отказ через
   * complete/stream. Разрушает parser/video и разъединяет pipeline; входящий request
   * ставит на паузу, не закрывая сокет самостоятельно.
   */
  const fail = (error: Error) => {
    ready.reject(error);
    completed.reject(error);
    video?.destroy(error);
    request.unpipe(envelope);
    request.pause();
    envelope.unpipe(parser);
    envelope.destroy();
    parser.destroy();
  };
  /**
   * Переводит отмену сигнала или обрыв запроса в типизированный отказ upload с остановкой
   * parser.
   */
  const abort = () => fail(new UploadRejected(StoryErrorCode.UploadCancelled));
  signal.addEventListener("abort", abort, { once: true });
  request.once("error", fail);
  request.once("aborted", abort);
  envelope.once("error", fail);
  parser.once("error", () =>
    fail(new UploadRejected(StoryErrorCode.InvalidUpload)),
  );
  parser.on("file", (name, stream) => {
    stream.on("error", fail);
    if (name !== "video" || video) {
      stream.resume();
      fail(new UploadRejected(StoryErrorCode.InvalidUpload));
      return;
    }
    video = stream;
    stream.once("limit", () =>
      fail(new UploadRejected(StoryErrorCode.FileTooLarge)),
    );
    ready.resolve({ source: videoStream(stream), complete: completed.promise });
  });
  for (const event of ["filesLimit", "fieldsLimit", "partsLimit"] as const)
    parser.once(event, () =>
      fail(new UploadRejected(StoryErrorCode.InvalidUpload)),
    );
  parser.on("field", (_name, _value, info) => {
    if (info.valueTruncated)
      fail(new UploadRejected(StoryErrorCode.InvalidUpload));
  });
  parser.once("finish", () => {
    if (!video) fail(new UploadRejected(StoryErrorCode.InvalidUpload));
    else completed.resolve();
  });
  parser.once("close", () => {
    signal.removeEventListener("abort", abort);
    request.removeListener("error", fail);
    request.removeListener("aborted", abort);
  });
  request.pipe(envelope).pipe(parser);
  return ready.promise;
};
