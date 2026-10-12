import { storyReply } from "./lib/reply";
import type { StoryRequestDependencies } from "./types";
/** Проксирует публичное чтение ленты в Nest и формирует BFF-ответ с сохранением сведений об ошибке. */
export const feedRequest = async (
  request: Request,
  dependencies: Pick<StoryRequestDependencies, "backend" | "context">,
) =>
  storyReply(
    await dependencies.backend({ operation: "feed", request }),
    dependencies.context,
  );
