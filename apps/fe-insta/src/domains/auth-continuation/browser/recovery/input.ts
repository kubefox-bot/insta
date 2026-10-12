import type { IntentInput } from "../../domain/types";
import type { RecoveryPayloadState, RecoveryState } from "./types";
/**
 * Предпочитает явно выбранный input; иначе строит compose_message/resume_story по suspended
 * metadata, не включая текст или видео в серверный intent.
 */
export const selectionInput = (
  state: Pick<RecoveryState, "selectedInput"> &
    Pick<RecoveryPayloadState, "suspended">,
): IntentInput | undefined => {
  if (state.selectedInput) return state.selectedInput;
  const suspended = state.suspended;
  if (!suspended) return undefined;
  switch (suspended.kind) {
    case "message":
      return {
        type: "compose_message",
        recipientId: suspended.recipientId,
        operationId: suspended.key,
      };
    case "story":
      return { type: "resume_story", operationId: suspended.key };
    default: {
      const exhaustive: never = suspended;
      return exhaustive;
    }
  }
};
