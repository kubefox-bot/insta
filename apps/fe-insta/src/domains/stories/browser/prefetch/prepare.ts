import type { FeedStory } from "../../domain/feed/types";
import type { PreparationDependencies } from "./types";
/** Предзагружает только неистёкшую новую Story при выключенном saveData; проверяет поколение, срок URL и повторно saveData после ответа, освобождая ресурс при ошибке или истечении. */
export const prepareStory = async ({
  story,
  dependencies,
}: Readonly<{ story: FeedStory; dependencies: PreparationDependencies }>) => {
  const { playback, clock, preloader, owner, lifetime, expiry, release } =
    dependencies;
  if (
    preloader.saveData() ||
    story.expiresAt <= clock.now() ||
    owner.storyId === story.id
  )
    return;
  release();
  owner.storyId = story.id;
  const request = lifetime.begin();
  if (!request) return;
  try {
    const result = await playback({ id: story.id, signal: request.signal });
    if (!request.isCurrent()) return;
    const expiresAt = Math.min(result.expiresAt, story.expiresAt);
    if (expiresAt <= clock.now() || preloader.saveData()) {
      release();
      return;
    }
    owner.releaseMedia = preloader.prepare(result.url);
    expiry.schedule({ expiresAt, expire: release });
  } catch {
    if (request.isCurrent()) release();
  }
};
