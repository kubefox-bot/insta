import type { ConversationActor } from "../browser/types";
import { conversationIssues } from "../conts";
import { loadConversationList } from "./list";

/** Готовит SSR-снимок списка, привязанный к actor. Для гостя не выполняет чтение; сбой чтения сохраняет actor и явный признак недоступности. */
export const loadConversationSnapshot = async ({
  actor,
  read,
}: Readonly<{
  actor: ConversationActor | null;
  read: () => Promise<Response>;
}>) => {
  if (!actor)
    return {
      conversations: [],
      conversationsActor: null,
      conversationsTotalUnreadCount: undefined,
      conversationsIssue: undefined,
    };
  try {
    const result = await loadConversationList(await read());
    return {
      conversations: result.items,
      conversationsActor: actor,
      conversationsTotalUnreadCount: result.totalUnreadCount,
      conversationsIssue: result.issue,
    };
  } catch {
    return {
      conversations: [],
      conversationsActor: actor,
      conversationsTotalUnreadCount: undefined,
      conversationsIssue: conversationIssues.conversationsUnavailable,
    };
  }
};
