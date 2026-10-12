import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode, StoryErrorCode } from "@insta/contracts/errors";
import type {
  PublishedStory,
  StoryError,
  StoryFile,
  UploadClaim,
} from "../../domain/types";
import type { StoryDependencies } from "../../ports/persistence/interfaces";
import { storeVerified } from "./store-verified";
/**
 * Разрешает публичного автора, сохраняет и проверяет media, затем публикует по claim.
 * Текущую lifetime-policy применяет только к новой записи, проверяя диапазон expiresAt
 * перед persistence.
 */
export const publishClaim = async ({
  input,
  claim,
  signal,
  dependencies,
}: Readonly<{
  input: Readonly<{ file: StoryFile }>;
  claim: UploadClaim;
  signal: AbortSignal;
  dependencies: StoryDependencies;
}>): Promise<Result<PublishedStory, StoryError>> => {
  const author = await dependencies.authors.findPublicUser({
    id: claim.actorId,
  });
  if (author.isError())
    return Result.Error(CommonErrorCode.DependencyUnavailable);
  const media = await storeVerified({
    claim,
    file: input.file,
    signal,
    dependencies,
  });
  if (media.isError()) return Result.Error(media.getError());
  if (signal.aborted) return Result.Error(StoryErrorCode.UploadCancelled);
  const now = dependencies.clock();
  const expiresAt = now + dependencies.policy.lifetimeMs;
  if (
    !Number.isSafeInteger(expiresAt) ||
    !Number.isFinite(new Date(expiresAt).getTime())
  )
    return Result.Error(CommonErrorCode.DependencyUnavailable);
  return dependencies.persistence.publish({
    claim,
    storyId: dependencies.uuid(),
    eventId: dependencies.uuid(),
    author: author.get(),
    media: media.get(),
    now,
    expiresAt,
  });
};
