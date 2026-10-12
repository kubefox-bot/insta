import type { ResumeTarget } from "../../domain/types";
/**
 * Строит внутренний путь по проверенной цели продолжения, сохраняя conversationId либо
 * operationId и режим Stories.
 */
export const targetPath = (target: ResumeTarget) => {
  switch (target.type) {
    case "open_conversation":
    case "compose_message":
      return `/conversations/${target.conversationId}`;
    case "create_story":
    case "resume_story":
      return `/stories/new?operationId=${target.operationId}&mode=${target.type}`;
    default: {
      const exhaustive: never = target;
      throw new Error(String(exhaustive));
    }
  }
};
