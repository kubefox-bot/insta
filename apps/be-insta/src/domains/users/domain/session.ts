import { durations } from "./conts";
import type { InitialSession } from "./types";
/**
 * Проверяет привязку issuedAt к моменту выдачи, положительный refresh срок и
 * фиксированный абсолютный deadline начальной сессии.
 */
export const validInitialSession = ({
  session,
  now,
}: Readonly<{ session: InitialSession; now: number }>) =>
  session.issuedAt === now &&
  session.expiresAt > now &&
  session.expiresAt <=
    Math.min(now + durations.refreshMs, session.absoluteExpiresAt) &&
  session.absoluteExpiresAt === now + durations.absoluteSessionMs;
