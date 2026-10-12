import { z } from "zod";
import { bootstrapTimeoutMs } from "./conts";
/** Проверяет отдельный delivery URL, не используя auth fallback. */
export const readDeliveryBrokerConfig = () => {
  const result = z
    .url()
    .refine((value) => {
      if (!URL.canParse(value)) return false;
      const url = new URL(value);
      return ["redis:", "rediss:"].includes(url.protocol) && !!url.password;
    })
    .safeParse(Bun.env.DELIVERY_DRAGONFLY_URL);
  if (!result.success) throw new Error("Invalid DELIVERY_DRAGONFLY_URL");
  return { url: result.data, timeoutMs: bootstrapTimeoutMs };
};
/** Проверяет обязательный DRAGONFLY_URL из Bun.env как URL и добавляет фиксированный bootstrap timeout. Ошибка не раскрывает значение; соединение здесь не создаётся. */
export const readBrokerConfig = () => {
  const result = z.url().safeParse(Bun.env.DRAGONFLY_URL);
  if (!result.success) throw new Error("Missing DRAGONFLY_URL");
  return { url: result.data, timeoutMs: bootstrapTimeoutMs };
};
