import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode, StoryErrorCode } from "@insta/contracts/errors";
import { storyWireLimits } from "@insta/contracts/stories";
import { storyPolicy } from "../../domain/conts";
import type { StoryError, StoryFile, UploadClaim } from "../../domain/types";
import type { VerifiedMedia } from "../../ports/media-inspector/interfaces";
import type { StoryDependencies } from "../../ports/persistence/interfaces";
/**
 * Записывает ограниченный поток в уникальный объект, ждёт полного разбора envelope и
 * повторно читает объект для проверки media. Неизвестный эффект storage не выдаёт за
 * отсутствие объекта; cleanup остаётся durable учёту.
 */
export const storeVerified = async ({
  claim,
  file,
  signal,
  dependencies,
}: Readonly<{
  claim: UploadClaim;
  file: StoryFile;
  signal: AbortSignal;
  dependencies: StoryDependencies;
}>): Promise<Result<VerifiedMedia, StoryError>> => {
  if (signal.aborted) return Result.Error(StoryErrorCode.UploadCancelled);
  const upload = await file(signal);
  // Observe parser rejection immediately while storage consumes its video stream.
  upload.complete.catch(() => undefined);
  const stored = await dependencies.storage.putUnique({
    profile: claim.profile,
    key: claim.key,
    source: upload.source,
    maxBytes: storyWireLimits.maxFileBytes,
    signal,
  });
  if (stored.isError()) {
    if (stored.getError() === StoryErrorCode.FileTooLarge)
      return Result.Error(StoryErrorCode.FileTooLarge);
    return Result.Error(CommonErrorCode.OperationOutcomeUnknown);
  }
  await upload.complete;
  if (signal.aborted) return Result.Error(StoryErrorCode.UploadCancelled);
  const object = await dependencies.storage.read({
    profile: claim.profile,
    key: claim.key,
    signal,
  });
  if (object.kind === "missing")
    return Result.Error(CommonErrorCode.OperationOutcomeUnknown);
  return dependencies.media.inspect({
    source: object.source,
    maxBytes: storyWireLimits.maxFileBytes,
    maxDurationMs: dependencies.policy.maxDurationMs,
    deadline: dependencies.clock() + storyPolicy.inspectionMs,
  });
};
