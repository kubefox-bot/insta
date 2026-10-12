import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode } from "@insta/contracts/errors";
import type { UploadClaim } from "../../domain/types";
import type { StoryUploads } from "../../ports/persistence/interfaces";
/**
 * Получает захват либо сохранённый исход операции; исключение storage трактует как
 * unknown outcome, поскольку запись claim могла состояться.
 */
export const claimUpload = async ({
  claim,
  uploads,
}: Readonly<{ claim: UploadClaim; uploads: StoryUploads }>): Promise<
  Result<
    Awaited<ReturnType<StoryUploads["claim"]>>,
    CommonErrorCode.OperationOutcomeUnknown
  >
> => {
  try {
    return Result.Ok(await uploads.claim(claim));
  } catch {
    return Result.Error(CommonErrorCode.OperationOutcomeUnknown);
  }
};
