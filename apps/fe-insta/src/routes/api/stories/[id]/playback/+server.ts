import type { RequestHandler } from "@sveltejs/kit";
/** Передаёт story id и исходный request playback-порту, сохраняя headers запроса медиа. Возвращает его ответ без буферизации тела на уровне route. */
export const GET: RequestHandler = ({ request, locals, params }) =>
  locals.stories.playback({ request, id: params.id ?? "" });
