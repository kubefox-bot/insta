import { z } from "zod";
import { sessionEndpoint, sessionRequiredStatus } from "./conts";

const actorSchema = z.object({
  userId: z.string(),
  username: z.string(),
  generation: z.string(),
});
/**
 * Читает actor через same-origin BFF без кеша; session_required возвращает null, прочие
 * HTTP-ошибки и неверный payload отклоняют чтение.
 */
export const readBrowserSession = async (signal?: AbortSignal) => {
  const response = await fetch(sessionEndpoint, {
    cache: "no-store",
    signal,
    credentials: "same-origin",
  });
  if (response.status === sessionRequiredStatus) return null;
  if (!response.ok) throw new Error("Session unavailable");
  return z
    .object({ ok: z.literal(true), data: actorSchema })
    .parse(await response.json(), { jitless: true }).data;
};
