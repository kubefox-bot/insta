import type { RequestHandler } from "@sveltejs/kit";
/** Возвращает подготовленное для запроса privacy preference с no-store; персональное согласие не должно попадать в общий HTTP-кэш. */
export const GET: RequestHandler = async ({ locals }) =>
  Response.json(locals.privacy, { headers: { "Cache-Control": "no-store" } });
/** Передаёт изменение privacy preference её владельцу с request и origin; проверка cookie-мутации и сохранение согласия выполняются savePrivacy. */
export const POST: RequestHandler = async ({ request, url, locals }) =>
  locals.savePrivacy({ request, origin: url.origin });
