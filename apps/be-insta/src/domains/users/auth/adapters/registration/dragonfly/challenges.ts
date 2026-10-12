import { Result } from "@bloodyowl/boxed";
import type { RedisClient } from "bun";
import { z } from "zod";
import {
  evaluateFenced,
  readGeneration,
} from "../../../../../../lib/dragonfly/index";
import { otpPolicy } from "../../../domain/registration/conts";
import type { Challenges } from "../../../ports/registration/challenges";
import { registrationQueue } from "./conts";
import { errorSchema, storedChallengeSchema } from "./schema";
import { enqueueLua } from "./scripts";
import { verifyChallenge } from "./verify";
/**
 * Собирает challenge-хранилище с generation fencing; использует заимствованный Redis и
 * атомарный enqueue письма вместе с версией challenge.
 */
export const createDragonflyChallenges = ({
  client,
  namespace = "users:registration",
}: Readonly<{ client: RedisClient; namespace?: string }>): Challenges => {
  /**
   * Читает текущее поколение auth и выполняет Lua с fencing, чтобы смена поколения не
   * позволила записать устаревшее состояние.
   */
  const evaluate = async (
    input: Readonly<{
      script: string;
      keys: readonly string[];
      arguments: readonly string[];
    }>,
  ) =>
    evaluateFenced({
      client,
      generation: await readGeneration(client),
      ...input,
    });
  return {
    /**
     * Читает и валидирует JSON challenge текущего поколения; отсутствие возвращает null,
     * ошибки Redis или схемы не маскирует.
     */
    read: async (challengeId) => {
      const value = await evaluate({
        script: "return redis.call('GET', KEYS[2])",
        keys: [`${namespace}:challenge:${challengeId}`],
        arguments: [],
      });
      return value === null
        ? null
        : storedChallengeSchema.parse(JSON.parse(z.string().parse(value)));
    },
    /**
     * Атомарно передаёт Lua ожидаемую revision, новую версию challenge и зашифрованное
     * письмо; возвращает сохранённый challenge либо код конфликта/политики.
     */
    enqueue: async ({ expected, challenge, mailPayload, now, operationId }) => {
      const value = await evaluate({
        script: enqueueLua,
        keys: [
          `${namespace}:challenge:${challenge.challengeId}`,
          `${namespace}:mail`,
          `${namespace}:payload:${challenge.version}`,
          `${namespace}:payload:${expected?.version ?? challenge.version}`,
        ],
        arguments: [
          String(expected?.revision ?? 0),
          JSON.stringify(challenge),
          String(now),
          mailPayload,
          operationId,
          registrationQueue.group,
          String(otpPolicy.errors),
          expected?.version ?? "",
        ],
      });
      return value === "OK"
        ? Result.Ok(challenge)
        : Result.Error(errorSchema.parse(value));
    },
    verify: verifyChallenge({ client, namespace }),
  };
};
