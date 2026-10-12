import { Result } from "@bloodyowl/boxed";
import { SupportErrorCode } from "@insta/contracts/errors";
import { httpHeaderNames } from "@insta/contracts/http";
import { z } from "zod";
import type {
  SupportFailure,
  SupportReceipt,
  SupportSubmission,
} from "../../../domain/types";
import { supportTransport } from "../../conts";
import { decodeSupportFailure } from "../../decode-failure";
import { supportReplySchema } from "../../receipt";

const contextSchema = z.strictObject({
  ok: z.literal(true),
  data: z.strictObject({ scopeId: z.uuid() }),
  meta: z.unknown(),
});
/**
 * Объединяет отмену владельца с таймаутом транспорта; сигнал ограничивает ожидание запроса, не
 * доказывая отсутствие серверного эффекта.
 */
const requestSignal = (signal?: AbortSignal) =>
  signal
    ? AbortSignal.any([signal, AbortSignal.timeout(supportTransport.timeoutMs)])
    : AbortSignal.timeout(supportTransport.timeoutMs);
/**
 * Получает scopeId формы через BFF с таймаутом и проверкой ответа; HTTP-ошибка отклоняет
 * открытие.
 */
export const openSupportForm = async (signal?: AbortSignal) => {
  const response = await fetch(supportTransport.contextPath, {
    method: "POST",
    signal: requestSignal(signal),
  });
  if (!response.ok) throw new Error(SupportErrorCode.SupportUnavailable);
  return contextSchema.parse(await response.json()).data.scopeId;
};
/**
 * Отправляет фиксированный payload с новым requestId и возвращает квитанцию либо категорию
 * ошибки; сбой сети, отмена и неверная квитанция дают unknown.
 */
export const submitSupport = async (
  input: SupportSubmission,
  signal?: AbortSignal,
): Promise<Result<SupportReceipt, SupportFailure>> => {
  try {
    const response = await fetch(supportTransport.submitPath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [httpHeaderNames.requestId]: crypto.randomUUID(),
      },
      body: JSON.stringify(input),
      signal: requestSignal(signal),
    });
    const raw: unknown = await response.json();
    if (!response.ok) return Result.Error(decodeSupportFailure(raw));
    const parsed = supportReplySchema.safeParse(raw);
    return parsed.success
      ? Result.Ok(parsed.data.data)
      : Result.Error("unknown");
  } catch {
    return Result.Error("unknown");
  }
};
