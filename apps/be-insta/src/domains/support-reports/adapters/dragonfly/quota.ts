import type { RedisClient } from "bun";
import { z } from "zod";
import {
  evaluateFenced,
  readGeneration,
} from "../../../../lib/dragonfly/index";
import { supportPolicy } from "../../domain/conts";
import { supportQuotaLua } from "./conts";
/**
 * Ограничивает ожидание fenced расхода квоты таймером и всегда снимает таймер. Timeout не
 * отменяет уже переданную Redis-команду и не доказывает отсутствие расхода.
 */
export const consumeSupportQuota = async (
  input: Readonly<{ client: RedisClient; identity: string }>,
) => {
  const timeout = Promise.withResolvers<never>();
  const timer = setTimeout(
    () => timeout.reject(new Error("Support quota unavailable")),
    supportPolicy.commandTimeoutMs,
  );
  try {
    /**
     * Читает поколение Dragonfly, атомарно увеличивает оконный счётчик и проверяет
     * числовой ответ.
     */
    const operation = async () =>
      z.number().parse(
        await evaluateFenced({
          client: input.client,
          generation: await readGeneration(input.client),
          script: supportQuotaLua,
          keys: [input.identity],
          arguments: [String(supportPolicy.windowMs)],
        }),
      );
    return await Promise.race([operation(), timeout.promise]);
  } finally {
    clearTimeout(timer);
  }
};
