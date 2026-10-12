import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode, StoryErrorCode } from "@insta/contracts/errors";
import { storyPolicy } from "../domain/conts";
import type { StoryDependencies } from "../ports/persistence/interfaces";
/**
 * Проверяет сохранённый expiresAt и подписывает playback через профиль записи. Срок URL
 * ограничивает оставшейся жизнью истории; текущая upload-policy старые записи не
 * пересчитывает.
 */
export const playbackStory = async (
  id: string,
  dependencies: Pick<StoryDependencies, "persistence" | "storage" | "clock">,
): Promise<
  Result<
    Readonly<{ url: string; expiresAt: number }>,
    StoryErrorCode.StoryNotFound | CommonErrorCode.DependencyUnavailable
  >
> => {
  try {
    const stored = await dependencies.persistence.findStory(id);
    const now = dependencies.clock();
    if (!stored || stored.story.expiresAt <= now)
      return Result.Error(StoryErrorCode.StoryNotFound);
    const expiresAt = Math.min(
      stored.story.expiresAt,
      now + storyPolicy.playbackMs,
    );
    const signed = dependencies.storage.signPlayback({
      profile: stored.profile,
      key: stored.key,
      expiresAt,
    });
    if (signed.kind === "expired")
      return Result.Error(StoryErrorCode.StoryNotFound);
    return Result.Ok({ url: signed.url, expiresAt: signed.expiresAt });
  } catch {
    return Result.Error(CommonErrorCode.DependencyUnavailable);
  }
};
