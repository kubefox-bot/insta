import { z } from "zod";
import { resumeTargetSchema } from "../domain/target";
import { continuationContextLock } from "./conts";

/**
 * Запрашивает resume только для UUID и проверяет цель ответа; HTTP-отказ или неверная схема
 * дают undefined, сетевые и JSON-ошибки остаются исключением.
 */
export const resolveContinuation = async (intentId: string) => {
  if (!z.uuid().safeParse(intentId, { jitless: true }).success)
    return undefined;
  const response = await fetch(`/api/auth/continuation/${intentId}/resume`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) return undefined;
  const parsed = z
    .object({ ok: z.literal(true), data: resumeTargetSchema })
    .safeParse(await response.json(), { jitless: true });
  return parsed.success ? parsed.data.data : undefined;
};
/**
 * Отправляет DELETE выбранного UUID intent и возвращает HTTP-успех; недопустимый идентификатор
 * не вызывает запрос, транспортное исключение не подавляется.
 */
export const cancelContinuation = async (intentId: string) => {
  if (!z.uuid().safeParse(intentId).success) return false;
  const response = await fetch(`/api/auth/continuation/${intentId}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  return response.ok;
};
/**
 * Создаёт intent под обязательным Web Lock контекста, проверяя квитанцию; без navigator.locks,
 * при HTTP-отказе или неверной схеме возвращает undefined.
 */
export const createContinuation = async (
  input: import("../domain/types").IntentInput,
) => {
  if (!navigator.locks) return undefined;
  return navigator.locks.request(continuationContextLock, async () => {
    const response = await fetch("/api/auth/continuation", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) return undefined;
    const parsed = z
      .object({
        ok: z.literal(true),
        data: z.strictObject({ intentId: z.uuid(), expiresAt: z.number() }),
      })
      .safeParse(await response.json(), { jitless: true });
    return parsed.success ? parsed.data.data : undefined;
  });
};
