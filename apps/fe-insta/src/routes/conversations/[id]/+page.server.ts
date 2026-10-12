import {
  conversationIssues,
  loadConversationHistory,
} from "../../../domains/conversations/server/index";
/** Для гостя возвращает пустую историю без backend вызова; для actor запрашивает историю указанного id через BFF и прикрепляет identity snapshot. Исключение превращает в historyUnavailable, сохраняя actor для клиентского согласования. */
export const load = async ({
  request,
  cookies,
  url,
  locals,
  params,
}: import("@sveltejs/kit").RequestEvent) => {
  const conversationId = params.id ?? "";
  const session = await locals.getSessionView();
  const actor = session.actor;
  if (!actor)
    return {
      conversationId,
      history: null,
      historyIssue: undefined,
      historyActor: null,
    };
  try {
    const result = await loadConversationHistory(
      await locals.conversations.history({
        request,
        cookies,
        origin: url.origin,
        owner: actor,
        conversationId,
      }),
    );
    return {
      conversationId,
      history: result.history,
      historyIssue: result.issue,
      historyActor: actor,
    };
  } catch {
    return {
      conversationId,
      history: null,
      historyIssue: conversationIssues.historyUnavailable,
      historyActor: actor,
    };
  }
};
