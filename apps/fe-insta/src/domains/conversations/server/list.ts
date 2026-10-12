import { z } from "zod";
import { listSchema } from "../contracts/schema";
import { conversationIssues } from "../conts";
/** Разбирает список и общий unread-счётчик; HTTP-ошибка возвращает пустые данные с признаком недоступности. Ошибки JSON и успешной схемы остаются исключениями. */
export const loadConversationList = async (response: Response) => {
  const raw: unknown = await response.json();
  if (!response.ok)
    return {
      items: [],
      totalUnreadCount: undefined,
      issue: conversationIssues.conversationsUnavailable,
    };
  return {
    ...z.object({ ok: z.literal(true), data: listSchema }).parse(raw).data,
  };
};
