import {
  readPublicFeed,
  readPublicPlayback,
} from "../../../adapters/http/public-response/read";
import type { FeedReader, PlaybackReader } from "../../ports/types";
/** Создаёт публичный транспорт ленты и playback через BFF с проверкой ответов и передачей отмены без кеширования. */
export const createStoryTransport = ({
  request,
  feedPath,
  playbackPath,
}: Readonly<{
  request: (input: string, init?: RequestInit) => Promise<Response>;
  feedPath: string;
  playbackPath: (id: string) => string;
}>): Readonly<{ read: FeedReader; playback: PlaybackReader }> => ({
  /** Читает страницу ленты с необязательным cursor и проверяет её публичную схему. */
  read: async ({ cursor, signal }) =>
    readPublicFeed(
      await request(
        cursor ? `${feedPath}?${new URLSearchParams({ cursor })}` : feedPath,
        { signal, credentials: "same-origin", cache: "no-store" },
      ),
    ),
  /** Получает и проверяет URL воспроизведения Story, передавая signal и same-origin credentials. */
  playback: async ({ id, signal }) =>
    readPublicPlayback(
      await request(playbackPath(id), {
        signal,
        credentials: "same-origin",
        cache: "no-store",
      }),
    ),
});
