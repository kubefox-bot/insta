import { intakePolicy } from "../client/conts";
import type { SafeFaroBody } from "../client/types";
/**
 * Отправляет проверенное Faro body receiver с deadline и отменяет ненужное тело ответа.
 * Успешный HTTP status даёт accepted; сетевой сбой, отказ HTTP или ошибка cancel —
 * unavailable, без автоматического повтора.
 */
export const publishFaro = async ({
  receiver,
  body,
}: Readonly<{ receiver: string; body: SafeFaroBody }>): Promise<
  "accepted" | "unavailable"
> => {
  try {
    const response = await fetch(receiver, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(intakePolicy.requestTimeoutMs),
    });
    await response.body?.cancel();
    return response.ok ? "accepted" : "unavailable";
  } catch {
    return "unavailable";
  }
};
