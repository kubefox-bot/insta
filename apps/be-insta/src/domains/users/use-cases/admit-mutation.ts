import { Result } from "@bloodyowl/boxed";
import { mutationLimits } from "../domain/conts";
import { emailKey } from "../domain/policy";
import type { AuthAdmissionFailure, AuthMutation } from "../domain/types";
import type { AuthLimits } from "../ports/auth-limits";
/**
 * Параллельно расходует лимиты email и источника; при ограничении выбирает максимальный
 * Retry-After, при сбое любого лимита возвращает unavailable.
 */
export const admitAuthMutation = async (
  input: Readonly<{ mutation: AuthMutation; email: string; source: string }>,
  { limits }: Readonly<{ limits: AuthLimits }>,
): Promise<Result<void, AuthAdmissionFailure>> => {
  const policy = mutationLimits[input.mutation];
  try {
    const results = await Promise.all([
      limits.consume({ limit: policy.email, subject: emailKey(input.email) }),
      limits.consume({ limit: policy.source, subject: input.source }),
    ]);
    let retryAfterSeconds = 0;
    for (const result of results) {
      if (result.isError()) return Result.Error({ state: "unavailable" });
      const outcome = result.get();
      if (outcome.state === "limited")
        retryAfterSeconds = Math.max(
          retryAfterSeconds,
          outcome.retryAfterSeconds,
        );
    }
    return retryAfterSeconds > 0
      ? Result.Error({ state: "limited", retryAfterSeconds })
      : Result.Ok(undefined);
  } catch {
    return Result.Error({ state: "unavailable" });
  }
};
