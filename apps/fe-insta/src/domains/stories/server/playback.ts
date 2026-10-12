import { storyReply } from "./lib/reply";
import type { StoryRequestDependencies } from "./types";
/** Запрашивает публичную ссылку воспроизведения у Nest и переносит подтверждённый результат либо ошибку в BFF-ответ. */
export const playbackRequest = async (
  input: Readonly<{ id: string; request: Request }>,
  dependencies: Pick<StoryRequestDependencies, "backend" | "context">,
) =>
  storyReply(
    await dependencies.backend({
      operation: "playback",
      id: input.id,
      request: input.request,
    }),
    dependencies.context,
  );
