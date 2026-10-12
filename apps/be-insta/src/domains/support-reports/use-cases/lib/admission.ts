import { Result } from "@bloodyowl/boxed";
import { SupportErrorCode } from "@insta/contracts/errors";
import type { Owner, SupportError } from "../../domain/types";
import type { Limits } from "../../ports/limits";
/**
 * Последовательно расходует квоты владельца и источника; первый отказ останавливает
 * admission, уже потраченная квота не компенсируется.
 */
export const admitReport = async (
  input: Readonly<{ owner: Owner; source: string }>,
  limits: Limits,
): Promise<Result<void, SupportError>> => {
  for (const limit of [
    { kind: "owner", subject: `${input.owner.kind}:${input.owner.id}` },
    { kind: "ip", subject: input.source },
  ] as const) {
    const admitted = await limits.consume(limit);
    if (admitted.isError()) return Result.Error(admitted.getError());
    if (admitted.get() === "limited")
      return Result.Error(SupportErrorCode.SupportRateLimited);
  }
  return Result.Ok(undefined);
};
