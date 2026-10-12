import { createHmac } from "node:crypto";
import { Result } from "@bloodyowl/boxed";
import type { RedisClient } from "bun";
import {
  incrementWindow,
  readGeneration,
} from "../../../../lib/dragonfly/index";
import { authLimits } from "../../domain/conts";
import type { LimitOutcome } from "../../domain/types";
import type { AuthLimits } from "../../ports/auth-limits";
import { millisecondsPerSecond } from "./conts";

/**
 * Создаёт лимиты auth на заимствованном Redis-клиенте; идентификаторы субъектов скрывает
 * HMAC, сбои хранилища возвращает как unavailable.
 */
export const createDragonflyAuthLimits = ({
  client,
  key,
}: Readonly<{ client: RedisClient; key: string }>): AuthLimits => {
  /**
   * Получает непрозрачный ключ субъекта лимита, чтобы email или источник запроса не
   * попадали в Redis-ключ открытым текстом.
   */
  const digest = (subject: string) =>
    createHmac("sha256", Buffer.from(key, "hex")).update(subject).digest("hex");
  /**
   * Увеличивает окно текущего поколения; превышение возвращает с округлённым вверх
   * Retry-After, сбой Dragonfly — как unavailable.
   */
  const increment = async ({
    identity,
    windowMs,
    maximum,
  }: Readonly<{
    identity: string;
    windowMs: number;
    maximum: number;
  }>): Promise<Result<LimitOutcome, "unavailable">> => {
    try {
      const generation = await readGeneration(client);
      const { count, ttlMs: ttl } = await incrementWindow({
        client,
        generation,
        key: identity,
        windowMs,
      });
      return Result.Ok(
        count > maximum
          ? {
              state: "limited",
              retryAfterSeconds: Math.ceil(ttl / millisecondsPerSecond),
            }
          : { state: "allowed" },
      );
    } catch {
      return Result.Error("unavailable");
    }
  };
  return {
    /**
     * Расходует попытку указанной auth-политики для HMAC-идентификатора субъекта, включая
     * попытки сверх лимита.
     */
    consume: ({ limit, subject }) =>
      increment({
        identity: `users:limit:${limit}:${digest(subject)}`,
        ...authLimits[limit],
      }),
    /**
     * Учитывает ошибку challenge до его срока истечения; уже истёкший challenge блокирует
     * без записи в Redis.
     */
    recordChallengeError: ({ challengeId, expiresAt, now }) => {
      if (expiresAt <= now)
        return Promise.resolve(
          Result.Ok({ state: "limited", retryAfterSeconds: 0 }),
        );
      return increment({
        identity: `users:challengeErrors:${digest(challengeId)}`,
        windowMs: expiresAt - now,
        maximum: authLimits.challengeErrors.maximum - 1,
      });
    },
  };
};
