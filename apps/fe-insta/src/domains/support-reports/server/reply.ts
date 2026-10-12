import type { RequestContext } from "../../../lib/api/server/index";
import { supportWebStatus } from "./conts";
/**
 * Формирует некешируемую ошибку поддержки с согласованным HTTP-статусом и корреляционным
 * контекстом.
 */
export const supportFailure = (
  code: keyof typeof supportWebStatus,
  context: RequestContext,
) =>
  Response.json(
    { ok: false, error: { code, message: code }, meta: context },
    {
      status: supportWebStatus[code],
      headers: { "Cache-Control": "no-store" },
    },
  );
