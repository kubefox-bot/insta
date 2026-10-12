import { z } from "zod";
import type { TicketOutcome } from "../../../lib/realtime/index";
import { sessionRequiredStatus } from "./conts";

const ticketSchema = z.object({
  ok: z.literal(true),
  data: z.object({ ticket: z.uuid(), expiresAt: z.number() }),
});
/**
 * Запрашивает ticket с отменой владельца, отличая отсутствие сессии от недоступности;
 * освобождает тело ошибочного ответа, неверный payload или исключение дают unavailable.
 */
export const obtainWsTicket = async (
  signal: AbortSignal,
): Promise<TicketOutcome> => {
  try {
    const response = await fetch("/api/realtime/ticket", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
    });
    if (response.status === sessionRequiredStatus) {
      await response.body?.cancel();
      return { kind: "unauthorized" };
    }
    if (!response.ok) {
      await response.body?.cancel();
      return { kind: "unavailable" };
    }
    const parsed = ticketSchema.safeParse(await response.json(), {
      jitless: true,
    });
    return parsed.success
      ? { kind: "issued", ticket: parsed.data.data.ticket }
      : { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
};
