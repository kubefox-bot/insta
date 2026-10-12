import type { RequestHandler } from "@sveltejs/kit";
/** Выбирает create для continuation executor и передаёт request, origin и cookies; валидация намерения и browser context остаётся у владельца continuation. */
export const POST: RequestHandler = ({ request, url, cookies, locals }) =>
  locals.continuation({
    request,
    origin: url.origin,
    cookies,
    operation: "create",
  });
