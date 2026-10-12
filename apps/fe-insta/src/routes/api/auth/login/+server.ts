import type { RequestHandler } from "@sveltejs/kit";
/** Передаёт login request, origin и изменяемый cookie API владельцу auth; проверка формы, создание session и установка cookie выполняются его обработчиком. */
export const POST: RequestHandler = ({ request, url, cookies, locals }) =>
  locals.auth.login({ request, origin: url.origin, cookies });
