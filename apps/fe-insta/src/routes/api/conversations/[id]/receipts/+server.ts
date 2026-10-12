import type { RequestHandler } from "@sveltejs/kit";
/** Передаёт подтверждение receipts владельцу conversations с session cookies, origin и route id; проверка участника и допустимых последовательностей не переносится в route. */
export const POST: RequestHandler = ({
  request,
  url,
  cookies,
  locals,
  params,
}) =>
  locals.conversations.acknowledgeReceipts({
    request,
    origin: url.origin,
    cookies,
    conversationId: params.id ?? "",
  });
