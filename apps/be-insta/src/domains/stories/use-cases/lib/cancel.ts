import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode } from "@insta/contracts/errors";
import type {
  PublishedStory,
  StoryError,
  UploadClaim,
} from "../../domain/types";
import type { StoryDependencies } from "../../ports/persistence/interfaces";
/**
 * Пытается отменить claim и перечитывает durable исход, сохраняя уже состоявшуюся
 * публикацию. Неподтверждённая отмена или чтение дают unknown outcome, учёт объекта
 * остаётся восстанавливаемым.
 */
export const cancelPublication = async ({
  claim,
  dependencies,
  code,
}: Readonly<{
  claim: UploadClaim;
  dependencies: StoryDependencies;
  code: StoryError;
}>): Promise<Result<PublishedStory, StoryError>> => {
  // A failed CAS acknowledgement is an unknown effect. Accounting remains durable.
  const cancelled = await dependencies.uploads.cancel({ ...claim, code }).then(
    () => true,
    () => false,
  );
  try {
    const status = await dependencies.persistence.read(claim);
    if (status.state === "published") return Result.Ok(status.story);
    return Result.Error(
      cancelled ? code : CommonErrorCode.OperationOutcomeUnknown,
    );
  } catch {
    return Result.Error(CommonErrorCode.OperationOutcomeUnknown);
  }
};
