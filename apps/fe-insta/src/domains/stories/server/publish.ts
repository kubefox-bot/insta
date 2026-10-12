import { authorizeStory } from "./lib/authorized";
import { storyReply } from "./lib/reply";
import type { StoryRequest, StoryRequestDependencies } from "./types";
/** Авторизует публикацию для указанного поколения сессии и передаёт загрузку Nest без повторного воспроизведения POST. */
export const publishRequest = async (
  input: StoryRequest,
  dependencies: StoryRequestDependencies,
) =>
  storyReply(
    await authorizeStory(input, dependencies, (accessToken) =>
      dependencies.backend({
        operation: "publish",
        request: input.request,
        accessToken,
      }),
    ),
    dependencies.context,
  );
