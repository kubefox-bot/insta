import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode, StoryErrorCode } from "@insta/contracts/errors";
import type { PublicationStatus, PublishedStory, StoryError } from "./types";
/**
 * Переводит сохранённое состояние операции в результат публикации; pending и неизвестный
 * исход остаются различимыми ошибками.
 */
export const publicationResult = (
  status: PublicationStatus,
): Result<PublishedStory, StoryError> => {
  switch (status.state) {
    case "published":
      return Result.Ok(status.story);
    case "failed":
      return Result.Error(status.code);
    case "pending":
      return Result.Error(StoryErrorCode.UploadPending);
    case "not_found":
      return Result.Error(CommonErrorCode.OperationOutcomeUnknown);
  }
};
