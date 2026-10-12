import type { FeedGroup } from "../../domain/feed/types";
import type { SelectionDependencies } from "./types";
/** Заменяет запрос выбора и получает публичный URL. Срок Story действует уже во время ожидания; поздний ответ игнорируется, ошибка актуального запроса даёт unavailable. */
export const selectStory = async ({
  group,
  index,
  dependencies,
}: Readonly<{
  group: FeedGroup;
  index: number;
  dependencies: SelectionDependencies;
}>) => {
  const { clock, playback, state, lifetime, expiry, prefetch, close } =
    dependencies;
  const request = lifetime.begin();
  if (!request) return;
  const story = group.stories[index];
  if (!story || story.expiresAt <= clock.now()) {
    close();
    return;
  }
  expiry.release();
  prefetch.release();
  const selection = { group, index, story };
  state.set({ kind: "loading", ...selection });
  // Story expiry applies even while an external read is pending.
  expiry.schedule({ expiresAt: story.expiresAt, expire: close });
  try {
    const result = await playback({ id: story.id, signal: request.signal });
    if (!request.isCurrent()) return;
    const expiresAt = Math.min(story.expiresAt, result.expiresAt);
    if (expiresAt <= clock.now()) {
      close();
      return;
    }
    state.set({
      kind: "ready",
      ...selection,
      playback: { ...result, expiresAt },
    });
    expiry.schedule({
      expiresAt,
      /** При истечении URL закрывает уже истёкшую Story либо повторяет тот же выбор. Ошибка получения URL даёт unavailable; отклонение самого сценария выбора закрывает просмотр. */
      expire: () => {
        if (story.expiresAt <= clock.now()) {
          close();
          return;
        }
        selectStory({ group, index, dependencies }).catch(close);
      },
    });
  } catch {
    if (request.isCurrent()) state.set({ kind: "unavailable", ...selection });
  }
};
