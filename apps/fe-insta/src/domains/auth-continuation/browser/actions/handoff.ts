import type { RecoveryIdentity } from "../../ports/recovery/types";
import type { ActionInput, Dependencies } from "./types";
/** Передаёт intent одному UI-владельцу до вызова навигации; последующая инвалидация action уже не отменяет этот intent. */
export const handoffAction = async (
  dependencies: Dependencies,
  {
    input,
    trigger,
    identity,
    intentId,
  }: Pick<ActionInput, "input" | "trigger"> &
    Readonly<{ identity: RecoveryIdentity; intentId: string }>,
) => {
  if (!identity.actor) {
    dependencies.openAuthentication({ intentId, type: input.type });
    return;
  }
  switch (input.type) {
    case "create_story":
      await dependencies.openStory({ intentId, trigger });
      return;
    case "open_conversation":
    case "compose_message":
    case "resume_story":
      await dependencies.openConversation({ intentId });
      return;
    default: {
      const unexpected: never = input.type;
      return unexpected;
    }
  }
};
