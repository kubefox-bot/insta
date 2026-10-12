import type { RequestHandler } from "@sveltejs/kit";
/** Передаёт явный resume указанного intent вместе с request, origin и cookies; проверку выбора, identity и допустимости продолжения выполняет executor. */
export const POST: RequestHandler = ({
  request,
  url,
  cookies,
  locals,
  params,
}) =>
  locals.continuation({
    request,
    origin: url.origin,
    cookies,
    intentId: params.id,
    operation: "resume",
  });
