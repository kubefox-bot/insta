import { Result } from "@bloodyowl/boxed";
import { SupportErrorCode } from "@insta/contracts/errors";
import { supportPolicy } from "../domain/conts";
import type {
  Owner,
  Receipt,
  ReportInput,
  SupportError,
} from "../domain/types";
import type { SupportDependencies } from "../ports/dependencies";
import { admitReport } from "./lib/admission";
/**
 * Проверяет пользователя либо гостевой proof, разрешает replay до расхода квоты и
 * сохраняет отчёт. Сбой сигнала Streams не отменяет durable запись; восстановление
 * принадлежит Mongo.
 */
export const submitReport = async (
  input: ReportInput &
    Readonly<{
      accessToken?: string;
      guestContext?: string | undefined;
      idempotencyKey: string;
      source: string;
      operationId: string;
    }>,
  dependencies: SupportDependencies,
): Promise<Result<Receipt, SupportError>> => {
  try {
    const identity =
      input.accessToken !== undefined
        ? await dependencies.actor(input.accessToken)
        : await dependencies.proof.verify({
            proof: input.guestContext ?? "",
            now: dependencies.clock(),
          });
    if (identity.isError()) return Result.Error(identity.getError());
    const owner: Owner = {
      kind: input.accessToken !== undefined ? "user" : "guest",
      id: identity.get(),
    };
    const payload: ReportInput = {
      comment: input.comment,
      errorCode: input.errorCode,
      ...(input.originalRequestId
        ? { originalRequestId: input.originalRequestId }
        : {}),
    };
    const fingerprint = dependencies.fingerprint(payload);
    const replay = await dependencies.reports.replay({
      owner,
      idempotencyKey: input.idempotencyKey,
      fingerprint,
      now: dependencies.clock(),
    });
    if (replay.isError()) return Result.Error(replay.getError());
    const receipt = replay.get();
    if (receipt) return Result.Ok(receipt);
    const admitted = await admitReport(
      { owner, source: input.source },
      dependencies.limits,
    );
    if (admitted.isError()) return Result.Error(admitted.getError());
    const now = dependencies.clock();
    const saved = await dependencies.reports.save({
      ...payload,
      owner,
      fingerprint,
      idempotencyKey: input.idempotencyKey,
      reportId: dependencies.uuid(),
      operationId: input.operationId,
      createdAt: now,
      expiresAt: now + supportPolicy.retentionMs,
      replayExpiresAt: now + supportPolicy.replayMs,
    });
    if (saved.isError()) return saved;
    // Streams is a wake-up hint; the durable Mongo outbox owns recovery.
    await dependencies.jobs
      .publish(saved.get().reportId)
      .catch(() => undefined);
    return saved;
  } catch {
    return Result.Error(SupportErrorCode.SupportUnavailable);
  }
};
