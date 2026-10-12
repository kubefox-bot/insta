import { ConversationSuccessCode } from "@insta/contracts/errors";
import type { GoalMapping } from "@insta/fe-core/observability/analytics";
export const conversationCreated = {
  operation: "conversation.start",
  kind: "conversation_created",
  code: ConversationSuccessCode.ConversationCreated,
  authority: "server_canonical",
  goal: "conversation_created",
} as const;
export const messageSent = {
  operation: "message.send",
  kind: "message_sent",
  code: "MESSAGE_PERSISTED",
  authority: "server_canonical",
  goal: "message_sent",
} as const;
export const conversationGoalCatalog = [
  {
    operation: conversationCreated.operation,
    authority: conversationCreated.authority,
    goal: conversationCreated.goal,
    successCodes: [conversationCreated.code],
  },
  {
    operation: messageSent.operation,
    authority: messageSent.authority,
    goal: messageSent.goal,
    successCodes: [messageSent.code],
  },
] as const satisfies readonly GoalMapping[];
