import { durations } from "../../domain/conts";
/**
 * Вычисляет refresh и access deadlines, ограничивая refresh абсолютным сроком сессии, а
 * access — полученным refresh сроком.
 */
export const sessionExpiry = ({
  now,
  absoluteExpiresAt,
}: Readonly<{ now: number; absoluteExpiresAt: number }>) => {
  const expiresAt = Math.min(now + durations.refreshMs, absoluteExpiresAt);
  return {
    expiresAt,
    accessExpiresAt: Math.min(now + durations.accessMs, expiresAt),
  };
};
