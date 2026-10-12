import { readinessTiming } from "@insta/contracts/http";
/** Проверяет Mailpit с ограниченным дедлайном и освобождает тело ответа; сеть или неуспешный HTTP дают degraded. */
export const checkMailReadiness = (
  mailpitUrl: string,
): Promise<"ok" | "degraded"> =>
  fetch(`${mailpitUrl}/readyz`, {
    signal: AbortSignal.timeout(readinessTiming.optionalMailProbeMs),
  }).then(
    async (response) => {
      await response.body?.cancel();
      return response.ok ? "ok" : "degraded";
    },
    () => "degraded",
  );
