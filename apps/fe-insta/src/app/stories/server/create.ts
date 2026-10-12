import {
  createStoryBackend,
  feedRequest,
  playbackRequest,
  publicationRequest,
  publishRequest,
  type StoryRequest,
} from "../../../domains/stories/server/index";
import type { RequestContext } from "../../../lib/api/server/index";
import { readRuntimeConfig } from "../../../lib/config/server/index";
import { createSessionRequest } from "../../users/server/session/index";
/**
 * Собирает Story BFF операции: публичные feed/playback используют REST backend,
 * publish/publication дополнительно получают session-порты; media и policy остаются у
 * backend.
 */
export const createStoryRequests = ({
  context,
  source,
}: Readonly<{ context: RequestContext; source: () => Promise<string> }>) => {
  /**
   * Готовит session-порты и backend для приватной операции публикации с текущим request
   * context.
   */
  const dependencies = async () => {
    const config = readRuntimeConfig();
    return {
      context,
      backend: createStoryBackend({ config, context, source }),
      session: await createSessionRequest({ context, source }),
      cookieKey: config.sessionKeys.cookieKey,
    };
  };
  return {
    /**
     * Передаёт запрос ленты Story публичному BFF обработчику без приобретения session store.
     */
    feed: (request: Request) =>
      feedRequest(request, {
        context,
        backend: createStoryBackend({
          config: readRuntimeConfig(),
          context,
          source,
        }),
      }),
    /**
     * Передаёт upload запрос владельцу публикации с session и REST backend зависимостями.
     */
    publish: async (input: StoryRequest) =>
      publishRequest(input, await dependencies()),
    /**
     * Проверяет исход операции публикации по operationId через BFF с session-зависимостями.
     */
    publication: async (
      input: StoryRequest & Readonly<{ operationId: string }>,
    ) => publicationRequest(input, await dependencies()),
    /**
     * Связывает playback-запрос Story с backend и корреляцией без приобретения session store.
     */
    playback: async (input: Readonly<{ id: string; request: Request }>) =>
      playbackRequest(input, {
        context,
        backend: createStoryBackend({
          config: readRuntimeConfig(),
          context,
          source,
        }),
      }),
  };
};
