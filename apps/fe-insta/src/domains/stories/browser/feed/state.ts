import { get, writable } from "svelte/store";
import type { FeedPage } from "../../domain/feed/types";
import { createExpiry } from "../lib/expiry/create";
import type { FeedDependencies } from "../types";
import { projectFeed, projectInitialFeed } from "./project";
/** Владеет накопленными страницами и приватным store ленты; таймер перепроецирует записи по срокам, dispose освобождает ожидание. */
export const createFeedState = ({
  initial,
  clock,
}: Pick<FeedDependencies, "initial" | "clock">) => {
  const pages = initial.kind === "ready" ? [initial.page] : [];
  const state = writable(projectInitialFeed({ initial, now: clock.now() }));
  const expiry = createExpiry(clock);
  /** Планирует ближайшее истечение среди отображаемых Stories, заменяя прежний таймер. */
  const schedule = () => {
    expiry.release();
    const current = get(state);
    const deadlines = current.authors.flatMap((group) =>
      group.stories.map((story) => story.expiresAt),
    );
    if (!deadlines.length) return;
    expiry.schedule({
      expiresAt: Math.min(...deadlines),
      /** Повторно проецирует накопленные страницы на текущее время, сохраняет статус загрузки и планирует следующий срок. */
      expire: () => {
        const latest = get(state);
        state.set(
          projectFeed({
            pages,
            now: clock.now(),
            cursor: latest.cursor,
            pending: latest.pending,
            unavailable: latest.kind === "unavailable",
          }),
        );
        schedule();
      },
    });
  };
  /** Заменяет либо дополняет принадлежащие владельцу страницы, обновляет вид и ближайший срок. */
  const accept = ({
    page,
    mode,
  }: Readonly<{ page: FeedPage; mode: "replace" | "append" }>) => {
    if (mode === "replace") pages.splice(0, pages.length);
    pages.push(page);
    state.set(projectFeed({ pages, now: clock.now(), cursor: page.cursor }));
    schedule();
  };
  schedule();
  return {
    view: { subscribe: state.subscribe },
    /** Возвращает текущий снимок вида ленты без изменения store. */
    current: () => get(state),
    accept,
    /** Отмечает ожидание чтения, сохраняя уже показанных авторов. */
    loading: () =>
      state.update((current) => ({
        ...current,
        kind: current.authors.length ? current.kind : "loading",
        pending: true,
      })),
    /** Отмечает ошибку чтения и завершает pending, сохраняя существующих авторов. */
    unavailable: () =>
      state.update((current) => ({
        ...current,
        kind: "unavailable",
        pending: false,
      })),
    dispose: expiry.release,
  };
};
