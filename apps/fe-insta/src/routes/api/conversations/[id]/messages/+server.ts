import type { RequestHandler } from "@sveltejs/kit";
/** Передаёт отправку сообщения conversation-порту с route id, request, cookies и origin; отсутствующий id становится пустой строкой для проверки владельцем. */
export const POST: RequestHandler = ({
  request,
  url,
  cookies,
  locals,
  params,
}) =>
  locals.conversations.send({
    request,
    origin: url.origin,
    cookies,
    conversationId: params.id ?? "",
  });
/** Передаёт чтение истории того же route id conversation-порту, сохраняя query и headers исходного request; маршрут не читает persistence напрямую. */
export const GET: import("@sveltejs/kit").RequestHandler = ({
  request,
  cookies,
  url,
  locals,
  params,
}) =>
  locals.conversations.history({
    request,
    cookies,
    origin: url.origin,
    conversationId: params.id ?? "",
  });
