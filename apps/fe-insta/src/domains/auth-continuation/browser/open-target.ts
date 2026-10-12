import type { ResumeTarget } from "../domain/types";
import type { ResumeDependencies } from "./types";
/**
 * Передаёт разрешённую цель владельцу разговоров или Stories; сам не отправляет сообщение и не
 * публикует видео.
 */
export const openTarget = (
  target: ResumeTarget,
  {
    openConversation,
    openStory,
  }: Pick<ResumeDependencies, "openConversation" | "openStory">,
) => {
  switch (target.type) {
    case "open_conversation":
    case "compose_message":
      return openConversation(target);
    case "create_story":
    case "resume_story":
      return openStory(target);
    default: {
      const exhaustive: never = target;
      throw new Error(String(exhaustive));
    }
  }
};
