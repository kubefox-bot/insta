import { replayMatches } from "../../../domain/intent";
import type { Targets } from "../../../ports/targets";
import { resolveConversationTarget } from "./resolve";
import type { ConversationTargetSource } from "./types";
/**
 * Адаптирует создание или поиск разговора в цель продолжения, предварительно защищая
 * consumed-intent от replay другой identity.
 */
export const createConversationTargets = ({
  start,
}: ConversationTargetSource): Targets => ({
  /**
   * Обрабатывает только conversation-intent, отвергает чужой replay и передаёт разрешение
   * разговора владельцу start.
   */
  resolve: async ({ intent, actor }) => {
    if (intent.state === "consumed" && !replayMatches({ intent, actor }))
      return undefined;
    switch (intent.type) {
      case "create_story":
      case "resume_story":
        return undefined;
      case "open_conversation":
      case "compose_message":
        return resolveConversationTarget({
          type: intent.type,
          recipientId: intent.recipientId,
          actor,
          start,
        });
      default: {
        const unknownType: never = intent.type;
        throw new Error(`Unsupported continuation type: ${unknownType}`);
      }
    }
  },
});
