import { readFeedPage } from "./feed/read";
import { createFeedState } from "./feed/state";
import { createRequestLifetime } from "./lib/request-lifetime/create";
import type { FeedDependencies, StoryFeed } from "./types";
/** Создаёт состояние ленты из SSR-снимка и владеет сроками и запросами последующего обновления. */
export const createStoryFeed = ({
  initial,
  read,
  clock,
}: FeedDependencies): StoryFeed => {
  const state = createFeedState({ initial, clock });
  const lifetime = createRequestLifetime();
  const dependencies = { read, state, lifetime };
  return {
    view: state.view,
    /** Инвалидирует текущий запрос и принимает новый SSR-снимок либо помечает ленту недоступной. */
    reconcile: (snapshot) => {
      if (!lifetime.begin()) return;
      if (snapshot.kind === "unavailable") {
        state.unavailable();
        return;
      }
      state.accept({ page: snapshot.page, mode: "replace" });
    },
    /** Обновляет первую страницу, заменяя накопленную ленту после успешного ответа. */
    refresh: async () => {
      await readFeedPage({ ...dependencies, cursor: null });
    },
    refreshForDelivery: () => readFeedPage({ ...dependencies, cursor: null }),
    /** Догружает страницу только при наличии cursor и отсутствии незавершённого чтения. */
    loadMore: async () => {
      const current = state.current();
      if (current.cursor && !current.pending)
        await readFeedPage({ ...dependencies, cursor: current.cursor });
    },
    /** Запрещает новые чтения и освобождает запрос и таймер истечения ленты. */
    dispose: () => {
      lifetime.dispose();
      state.dispose();
    },
  };
};
