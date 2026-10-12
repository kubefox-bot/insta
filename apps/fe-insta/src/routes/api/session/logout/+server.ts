import type { RequestHandler } from "@sveltejs/kit";
/** Направляет POST logout общему session-handler с исходными request, cookies и origin; блокировка, отзыв и cookie-эффекты принадлежат auth-порту. */
export const POST: RequestHandler = ({ request, url, cookies, locals }) =>
  locals.auth.session({ request, origin: url.origin, cookies });
