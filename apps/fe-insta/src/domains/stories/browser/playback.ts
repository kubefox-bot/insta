import { get, writable } from "svelte/store";
import { createExpiry } from "./lib/expiry/create";
import { createRequestLifetime } from "./lib/request-lifetime/create";
import { navigateStory } from "./playback/navigation";
import { selectStory } from "./playback/select";
import { createStoryPrefetch } from "./prefetch";
import type {
  PlayerDependencies,
  PlayerView,
  StoryPlayerBrowser,
} from "./types";
/** Создаёт приватное состояние проигрывателя и владельцев запросов, сроков и предзагрузки; вызывающий владелец должен вызвать dispose. */
export const createStoryPlayer = ({
  playback,
  clock,
  preloader,
}: PlayerDependencies): StoryPlayerBrowser => {
  const state = writable<PlayerView>({ kind: "closed" });
  const lifetime = createRequestLifetime();
  const expiry = createExpiry(clock);
  const prefetch = createStoryPrefetch({ playback, clock, preloader });
  /** Отменяет запрос и таймер выбора, освобождает предзагрузку и закрывает проигрыватель. */
  const close = () => {
    lifetime.release();
    expiry.release();
    prefetch.release();
    state.set({ kind: "closed" });
  };
  const dependencies = {
    clock,
    playback,
    state,
    lifetime,
    expiry,
    prefetch,
    close,
  };
  return {
    view: { subscribe: state.subscribe },
    /** Отбрасывает уже истёкшие Stories группы и выбирает первую оставшуюся. */
    open: async (group) => {
      const stories = group.stories.filter(
        (story) => story.expiresAt > clock.now(),
      );
      await selectStory({
        dependencies,
        group: { ...group, stories },
        index: 0,
      });
    },
    /** Выбирает следующую Story группы с проверкой доступности и срока. */
    next: () => navigateStory({ direction: "next", dependencies }),
    /** Выбирает предыдущую Story без перехода за начало группы. */
    previous: () => navigateStory({ direction: "previous", dependencies }),
    /** Повторно получает воспроизведение текущей Story. */
    retry: () => navigateStory({ direction: "retry", dependencies }),
    /** Предзагружает следующую Story только после готовности текущего выбора. */
    prepareNext: async () => {
      const current = get(state);
      if (current.kind !== "ready") return;
      const story = current.group.stories[current.index + 1];
      if (story) await prefetch.prepare(story);
    },
    close,
    /** Навсегда запрещает новые запросы и освобождает текущий просмотр и предзагрузку. */
    dispose: () => {
      lifetime.dispose();
      close();
    },
  };
};
