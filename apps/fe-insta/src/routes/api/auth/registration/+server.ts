import type { RequestHandler } from "@sveltejs/kit";
/** Передаёт registration request, origin и cookies auth-порту; стадии регистрации и cookie-эффекты не реализуются повторно в маршруте. */
export const POST: RequestHandler = ({ request, url, cookies, locals }) =>
  locals.auth.registration({ request, origin: url.origin, cookies });
