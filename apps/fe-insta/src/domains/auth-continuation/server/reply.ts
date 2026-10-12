import { intentStatus } from "./conts";
/**
 * Возвращает публичную квитанцию continuation без кеширования и с пустым meta.
 */
export const intentReply = (data: unknown) =>
  Response.json(
    { ok: true, data, meta: {} },
    { headers: { "Cache-Control": "no-store" } },
  );
/**
 * Возвращает код отказа continuation с согласованным HTTP-статусом и запретом кеширования.
 */
export const intentFailure = (code: keyof typeof intentStatus) =>
  Response.json(
    { ok: false, error: { code, message: code }, meta: {} },
    { status: intentStatus[code], headers: { "Cache-Control": "no-store" } },
  );
