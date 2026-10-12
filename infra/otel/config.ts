import { z } from "zod";
import { receiverPolicy } from "./conts";
/** Валидирует адрес и порт тестового receiver из переданного окружения либо Bun.env; отсутствие использует локальные defaults, недопустимые значения вызывают ошибку схемы. */
export const readReceiverConfig = (
  raw: Readonly<Record<string, string | undefined>> = Bun.env,
) =>
  z
    .object({
      hostname: z.enum(["127.0.0.1", "0.0.0.0"]).default("127.0.0.1"),
      port: z.coerce
        .number()
        .int()
        .min(1)
        .max(receiverPolicy.maximumPort)
        .default(receiverPolicy.defaultPort),
    })
    .parse({ hostname: raw.HOST, port: raw.PORT });
