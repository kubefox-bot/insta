import { authorizeStory } from "./lib/authorized";
import { storyReply } from "./lib/reply";
import type { StoryRequest, StoryRequestDependencies } from "./types";
/** Проверяет владельца веб-сессии перед чтением статуса публикации по operationId и преобразует результат Nest в BFF-ответ. */
export const publicationRequest = async (
  input: StoryRequest & Readonly<{ operationId: string }>,
  dependencies: StoryRequestDependencies,
) =>
  storyReply(
    await authorizeStory(input, dependencies, (accessToken) =>
      dependencies.backend({
        operation: "publication",
        id: input.operationId,
        request: input.request,
        accessToken,
      }),
    ),
    dependencies.context,
  );
