import type { RequestHandler } from "@sveltejs/kit";
/** Передаёт проверку web session в request-owned auth-порт с cookies и origin; маршрут не расшифровывает токены и возвращает ответ владельца сессии. */
export const GET: RequestHandler = ({ request, url, cookies, locals }) =>
  locals.auth.session({ request, origin: url.origin, cookies });
