import type { Actor } from "../domain/types";
import { ticketLifetimeMs } from "../domain/ws/conts";
import type { WsTickets } from "../ports/ws-tickets";
/**
 * Сохраняет случайный одноразовый ticket для уже авторизованного actor; его deadline не
 * превышает срок access token, ответ возвращается после записи.
 */
export const issueWsTicket = async (
  { actor }: Readonly<{ actor: Actor }>,
  {
    tickets,
    clock,
    random,
  }: Readonly<{
    tickets: Pick<WsTickets, "issue">;
    clock: () => number;
    random: () => string;
  }>,
) => {
  const ticket = random();
  const expiresAt = Math.min(clock() + ticketLifetimeMs, actor.accessExpiresAt);
  await tickets.issue({ ticket, actor, expiresAt });
  return { ticket, expiresAt };
};
