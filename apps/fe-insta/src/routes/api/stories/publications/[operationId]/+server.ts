import type { RequestHandler } from "@sveltejs/kit";
/** Передаёт проверку результата публикации по operationId stories-порту вместе с cookie session и origin; маршрут сам не повторяет публикацию при неизвестном исходе. */
export const GET: RequestHandler = ({
  request,
  url,
  cookies,
  locals,
  params,
}) =>
  locals.stories.publication({
    request,
    origin: url.origin,
    cookies,
    operationId: params.operationId ?? "",
  });
