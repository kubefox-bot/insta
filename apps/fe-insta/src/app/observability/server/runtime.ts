import { readLoggingConfig } from "../../../lib/config/server/index";
import { createObservability } from "../../../lib/observability/server/index";

let runtime: ReturnType<typeof createObservability> | undefined;
/**
 * Лениво создаёт общий серверный observability runtime и подключает публичный resolver Story
 * playback goal; закрытие остаётся у lifecycle процесса.
 */
export const readObservability = () => {
  runtime ??= createObservability(readLoggingConfig(), {
    resolveClientGoal: readStoryPlaybackGoal,
  });
  return runtime;
};
/**
 * Дожидается закрытия уже созданного observability runtime, не создавая его ради shutdown.
 */
export const closeObservability = async () => {
  await runtime?.close();
};

import { readStoryPlaybackGoal } from "../../../domains/stories/server/index";
