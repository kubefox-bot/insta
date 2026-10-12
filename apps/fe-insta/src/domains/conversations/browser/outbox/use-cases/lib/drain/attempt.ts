import { beginAttempt } from "../../../domain/transition";
import type { QueuedMessage, SendOutcome } from "../../../domain/types";
import { emptySummary } from "./conts";
import { isCurrent } from "./current";
import type { LockedOutcome, PassDependencies, PassInput } from "./types";
/** Сохраняет начало попытки до сети, проверяет владение и отмену; исключение отправителя оставляет неизвестным исходом для безопасного повтора. */
export const sendAttempt = async (
  {
    input,
    record,
    confirmations,
  }: Readonly<{
    input: PassInput;
    record: QueuedMessage;
    confirmations: number;
  }>,
  dependencies: PassDependencies,
): Promise<LockedOutcome> => {
  const { queue, auth, sender, clock, signal } = dependencies;
  /** Формирует завершение прохода без сетевой попытки с переданной либо пустой сводкой. */
  const finished = (summary = emptySummary): LockedOutcome => ({
    kind: "finished",
    summary,
  });
  if (signal?.aborted || !isCurrent(input, auth) || !auth.online())
    return finished();
  const attempt = beginAttempt({
    record,
    authGeneration: input.authGeneration,
    now: clock?.() ?? input.now,
  });
  const persisted = await queue.update(attempt, record.revision);
  if (persisted.isError())
    return {
      kind: "finished",
      summary: { ...emptySummary, issue: persisted.getError() },
    };
  if (!persisted.get() || !isCurrent(input, auth) || signal?.aborted)
    return finished();
  if (!auth.online()) {
    await queue.update(
      { ...record, revision: attempt.revision + 1 },
      attempt.revision,
    );
    return finished();
  }
  const outcome: SendOutcome = await sender(attempt, { signal }).catch(
    () => ({ kind: "unknown" }) as const,
  );
  return {
    kind: "attempted",
    attempt: { record: attempt, manualAttempt: record.manualAttempt },
    outcome,
    confirmations,
  };
};
