import { mergeFeedPages } from "../../domain/feed/merge";
import type { FeedPage, FeedSnapshot } from "../../domain/feed/types";
import type { FeedView } from "../types";
/** Строит вид ленты из объединённых неистёкших Stories, сохраняя cursor и признаки ожидания и недоступности. */
export const projectFeed = ({
  pages,
  now,
  cursor,
  pending = false,
  unavailable = false,
}: Readonly<{
  pages: readonly FeedPage[];
  now: number;
  cursor: string | null;
  pending?: boolean;
  unavailable?: boolean;
}>): FeedView => {
  const authors = mergeFeedPages({ pages, now });
  const availableKind = authors.length ? "ready" : "empty";
  return {
    authors,
    cursor,
    pending,
    kind: unavailable ? "unavailable" : availableKind,
  };
};

/** Преобразует SSR-снимок в начальный вид с удалением истёкших Stories и явным состоянием недоступности. */
export const projectInitialFeed = ({
  initial,
  now,
}: Readonly<{ initial: FeedSnapshot; now: number }>): FeedView =>
  projectFeed({
    pages: initial.kind === "ready" ? [initial.page] : [],
    cursor: initial.kind === "ready" ? initial.page.cursor : null,
    now,
    unavailable: initial.kind === "unavailable",
  });
