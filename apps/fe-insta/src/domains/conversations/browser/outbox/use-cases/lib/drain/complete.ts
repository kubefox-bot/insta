import { afterAttempt } from "../../../domain/transition";
import type { DrainSummary, SendOutcome } from "../../../domain/types";
import type { AttemptContext, PassDependencies, PassInput } from "./types";
/** Удаляет подтверждённую запись ревизионно либо сохраняет следующий исход; при офлайне возвращает попытку в ожидание, ошибки persistence отражает в сводке. */
export const completeAttempt = async (
  {
    attempt,
    outcome,
    input,
  }: Readonly<{
    attempt: AttemptContext;
    outcome: SendOutcome;
    input: PassInput;
  }>,
  { queue, auth, clock, jitter }: PassDependencies,
): Promise<DrainSummary> => {
  const { record, manualAttempt } = attempt;
  if (outcome.kind === "confirmed") {
    const removed = await queue.remove(record);
    return {
      sent: 1,
      confirmed: removed.isOk() && removed.get() ? 1 : 0,
      needsConfirmation: 0,
      ...(removed.isError() ? { issue: removed.getError() } : {}),
    };
  }
  const next = auth.online()
    ? afterAttempt({
        record,
        manualAttempt,
        outcome,
        now: clock?.() ?? input.now,
        jitter: jitter(),
      })
    : {
        ...record,
        attempts: record.attempts - 1,
        nextAttemptAt: 0,
        revision: record.revision + 1,
      };
  const saved = await queue.update(next, record.revision);
  return {
    sent: 1,
    confirmed: 0,
    needsConfirmation: Number(next.needsConfirmation),
    ...(saved.isError() ? { issue: saved.getError() } : {}),
    ...(next.state === "queued" ? { nextAttemptAt: next.nextAttemptAt } : {}),
  };
};
