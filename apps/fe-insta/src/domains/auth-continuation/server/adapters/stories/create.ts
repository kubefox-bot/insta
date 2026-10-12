import { replayMatches } from "../../../domain/intent";
import type { Targets } from "../../../ports/targets";
import type { StoryTargetSource } from "./types";
/**
 * Соединяет Stories-провайдер с портом целей продолжения, сохраняя operationId и проверку
 * identity для повторов.
 */
export const createStoryTargets = ({
  resolve,
}: StoryTargetSource): Targets => ({
  /**
   * Передаёт Stories-intent своему провайдеру только для допустимого типа и совпадающего actor
   * при replay; другие цели возвращает как отсутствующие.
   */
  resolve: async ({ intent, actor }) => {
    if (intent.state === "consumed" && !replayMatches({ intent, actor }))
      return undefined;
    if (intent.type !== "create_story" && intent.type !== "resume_story")
      return undefined;
    return resolve({
      type: intent.type,
      operationId: intent.operationId,
      actor,
    });
  },
});
