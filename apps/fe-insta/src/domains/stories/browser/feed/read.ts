import type { createRequestLifetime } from "../lib/request-lifetime/create";
import type { FeedReader } from "../ports/types";
import type { createFeedState } from "./state";
/** Начинает новое поколение чтения страницы; принимает замену или дополнение только для актуального запроса и отдельно отображает недоступность. */
export const readFeedPage = async ({
  cursor,
  read,
  state,
  lifetime,
}: Readonly<{
  cursor: string | null;
  read: FeedReader;
  state: ReturnType<typeof createFeedState>;
  lifetime: ReturnType<typeof createRequestLifetime>;
}>) => {
  const request = lifetime.begin();
  if (!request) return "stale" as const;
  state.loading();
  try {
    const page = await read({ cursor, signal: request.signal });
    if (!request.isCurrent()) return "stale" as const;
    const mode = cursor === null ? "replace" : "append";
    state.accept({ page, mode });
    return "applied" as const;
  } catch {
    if (!request.isCurrent()) return "stale" as const;
    state.unavailable();
    return "retry-later" as const;
  }
};
