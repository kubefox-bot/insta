import type { RequestHandler } from "@sveltejs/kit";
/** Передаёт обращение в support-порт с request, origin и cookies; проверка form context и отправка/сохранение обращения остаются у владельца support. */
export const POST: RequestHandler = ({ request, url, cookies, locals }) =>
  locals.support.submit({ request, origin: url.origin, cookies });
