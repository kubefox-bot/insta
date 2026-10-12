import { z } from "zod";
import { defaultApiTimeoutMs } from "../conts";
/**
 * Требует валидный redis URL Dragonfly для continuation и добавляет установленный
 * timeout. Неверное окружение останавливает конфигурацию без раскрытия URL.
 */
export const readContinuationConfig = (
  raw: Readonly<Record<string, string | undefined>> = Bun.env,
) => {
  const parsed = z
    .object({
      url: z.url().refine((url) => new URL(url).protocol === "redis:"),
    })
    .safeParse({ url: raw.DRAGONFLY_URL });
  if (!parsed.success)
    throw new Error("Invalid continuation configuration: DRAGONFLY_URL");
  return { url: parsed.data.url, timeoutMs: defaultApiTimeoutMs };
};
