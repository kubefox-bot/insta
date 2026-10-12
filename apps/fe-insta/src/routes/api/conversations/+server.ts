import type { RequestHandler } from "@sveltejs/kit";
/** Передаёт чтение списка conversations request-owned порту с cookie session и origin; возвращает его HTTP-ответ без локальной копии правил доступа. */
export const GET: RequestHandler = ({ request, cookies, url, locals }) =>
  locals.conversations.list({ request, cookies, origin: url.origin });
/** Передаёт создание conversation BFF-порту с исходным телом запроса, cookies и origin; идентификацию участника и результат контролирует capability. */
export const POST: RequestHandler = ({ request, cookies, url, locals }) =>
  locals.conversations.start({ request, cookies, origin: url.origin });
