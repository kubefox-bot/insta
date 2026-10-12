import { Result } from "@bloodyowl/boxed";
import type { RedisClient } from "bun";
import { z } from "zod";
import {
  evaluateFenced,
  readGeneration,
} from "../../../../../../lib/dragonfly/index";
import { otpPolicy } from "../../../domain/registration/conts";
import type { Challenges } from "../../../ports/registration/challenges";
import { errorSchema } from "./schema";
import { verifyLua } from "./scripts";
/**
 * Создаёт атомарную проверку challenge по ожидаемым revision/version, времени и
 * результату сравнения кода; Lua потребляет challenge и возвращает зашифрованный
 * email-контекст либо ожидаемый отказ.
 */
export const verifyChallenge = ({
  client,
  namespace,
}: Readonly<{
  client: RedisClient;
  namespace: string;
}>): Challenges["verify"] => {
  /**
   * Выполняет verification Lua под актуальным generation fence; смена поколения не
   * допускает потребление устаревшего challenge.
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
  return async ({ expected, matches, now }) => {
    const value = z.array(z.string()).parse(
      await evaluate({
        script: verifyLua,
        keys: [`${namespace}:challenge:${expected.challengeId}`],
        arguments: [
          String(expected.revision),
          String(now),
          matches ? "1" : "0",
          String(otpPolicy.errors),
          expected.version,
        ],
      }),
    );
    if (value[0] !== "OK") return Result.Error(errorSchema.parse(value[0]));
    return Result.Ok(z.string().parse(value[1]));
  };
};
