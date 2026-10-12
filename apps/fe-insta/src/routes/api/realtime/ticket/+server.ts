import type { RequestHandler } from "@sveltejs/kit";
/** Передаёт выдачу realtime ticket auth-порту с web-session cookies и origin; маршрут возвращает его ответ, не раскрывая backend access token. */
export const POST: RequestHandler = ({ request, url, cookies, locals }) =>
  locals.auth.ticket({ request, origin: url.origin, cookies });
