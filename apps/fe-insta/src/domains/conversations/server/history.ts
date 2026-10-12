import { z } from "zod";
import { historySchema } from "../contracts/schema";
import { conversationIssues, historyAccessStatuses } from "../conts";
/** Разбирает BFF-ответ истории: 403/404 дают закрытый доступ, остальные HTTP-ошибки — временную недоступность, а повреждённый JSON или успешный payload нарушенной схемы отклоняет Promise. */
export const loadConversationHistory = async (response: Response) => {
  if (!response.ok) {
    await response.body?.cancel();
    return {
      history: null,
      issue: Object.values(historyAccessStatuses).some(
        (status) => status === response.status,
      )
        ? conversationIssues.historyForbidden
        : conversationIssues.historyUnavailable,
    };
  }
  const raw: unknown = await response.json();
  return {
    history: z.object({ ok: z.literal(true), data: historySchema }).parse(raw)
      .data,
  };
};
