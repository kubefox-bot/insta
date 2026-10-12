import type { RequestHandler } from "@sveltejs/kit";
/** Передаёт чтение directory auth-порту с request, cookie session и origin; проверка сессии и формат ответа остаются у владельца пользователей. */
export const GET: RequestHandler = ({ request, cookies, url, locals }) =>
  locals.auth.directory({ request, cookies, origin: url.origin });
