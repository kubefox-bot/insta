import type { RequestHandler } from "@sveltejs/kit";
/** Выбирает cancel для intent из route params и передаёт browser context владельцу continuation; маршрут не считает знание id достаточной авторизацией. */
export const DELETE: RequestHandler = ({
  request,
  url,
  cookies,
  locals,
  params,
}) =>
  locals.continuation({
    request,
    origin: url.origin,
    cookies,
    intentId: params.id,
    operation: "cancel",
  });
