import { Result } from "@bloodyowl/boxed";
import { SupportErrorCode } from "@insta/contracts/errors";
import { supportPolicy } from "../domain/conts";
import type { SupportError } from "../domain/types";
import type { FormContextDependencies } from "../ports/types";
/**
 * Расходует квоту выдачи формы по источнику и подписывает ограниченный по времени
 * гостевой контекст; сбой зависимостей возвращает support unavailable.
 */
export const issueFormContext = async (
  source: string,
  dependencies: FormContextDependencies,
): Promise<
  Result<Readonly<{ proof: string; expiresAt: number }>, SupportError>
> => {
  try {
    const allowed = await dependencies.limits.consume({
      kind: "context",
      subject: source,
    });
    if (allowed.isError()) return Result.Error(allowed.getError());
    if (allowed.get() === "limited")
      return Result.Error(SupportErrorCode.SupportRateLimited);
    const now = dependencies.clock();
    const expiresAt = now + supportPolicy.contextMs;
    const proof = await dependencies.proof.issue({
      contextId: dependencies.uuid(),
      now,
      expiresAt,
    });
    return Result.Ok({ proof, expiresAt });
  } catch {
    return Result.Error(SupportErrorCode.SupportUnavailable);
  }
};
