import type { StoryErrorCode } from "@insta/contracts/errors";
export class UploadRejected extends Error {
  /**
   * Сохраняет публичный код отказа multipart-загрузки и исходную причину для передачи
   * через потоковый pipeline.
   */
  constructor(
    readonly code:
      | StoryErrorCode.InvalidUpload
      | StoryErrorCode.FileTooLarge
      | StoryErrorCode.UploadCancelled,
    options?: ErrorOptions,
  ) {
    super(code, options);
  }
}
