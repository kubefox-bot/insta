import type { RequestHandler } from "@sveltejs/kit";
/** Передаёт публикацию Stories request-owned обработчику с cookies и origin, не читая и не копируя медиатело в маршруте; лимиты и авторизация принадлежат владельцу. */
export const POST: RequestHandler = ({ request, url, cookies, locals }) =>
  locals.stories.publish({ request, origin: url.origin, cookies });

/** Передаёт исходный request чтению Stories feed; доступность функции и формат HTTP-ответа определяет stories-порт. */
export const GET: RequestHandler = ({ request, locals }) =>
  locals.stories.feed(request);
