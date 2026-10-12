import type { DrainSummary } from "../domain/types";
import type { OutboxLocks } from "../ports/auth";
import { sendAttempt } from "./lib/drain/attempt";
import { completeAttempt } from "./lib/drain/complete";
import { emptySummary } from "./lib/drain/conts";
import { isCurrent } from "./lib/drain/current";
import { preparePass } from "./lib/drain/prepare";
import { reconcileActor } from "./lib/drain/reconcile";
import type {
  LockedOutcome,
  PassDependencies,
  PassInput,
} from "./lib/drain/types";

/** Под блокировкой проверяет владельца, готовит очередь и выполняет не более одной выбранной отправки. */
const runPass = async (
  input: PassInput,
  dependencies: PassDependencies,
): Promise<LockedOutcome> => {
  if (!isCurrent(input, dependencies.auth))
    return { kind: "finished", summary: emptySummary };
  const prepared = await preparePass(input, dependencies);
  if (prepared.isError())
    return {
      kind: "finished",
      summary: { ...emptySummary, issue: prepared.getError() },
    };
  const { record, confirmations, nextAttemptAt } = prepared.get();
  if (!record)
    return {
      kind: "finished",
      summary: {
        ...emptySummary,
        needsConfirmation: confirmations,
        nextAttemptAt,
      },
    };
  return sendAttempt({ input, record, confirmations }, dependencies);
};
/** Сверяет auth и выполняет попытку под блокировкой владельца; после освобождения блокировки повторно проверяет сессию перед фиксацией исхода. */
export const drain = async (
  input: PassInput,
  dependencies: PassDependencies & Readonly<{ locks: OutboxLocks }>,
): Promise<DrainSummary> => {
  if (!dependencies.auth.online()) return emptySummary;
  const initial = await reconcileActor(dependencies);
  if (initial.isError()) return { ...emptySummary, issue: initial.getError() };
  if (!isCurrent(input, dependencies.auth)) return emptySummary;
  const pass = await dependencies.locks.run(input.ownerId, () =>
    runPass(input, dependencies),
  );
  if (!pass) return emptySummary;
  if (pass.kind === "finished") return pass.summary;
  const summary = {
    sent: 1,
    confirmed: 0,
    needsConfirmation:
      pass.confirmations + Number(pass.attempt.record.needsConfirmation),
  };
  if (!isCurrent(input, dependencies.auth) || dependencies.signal?.aborted)
    return summary;
  const checked = await reconcileActor(dependencies);
  if (checked.isError()) return { ...summary, issue: checked.getError() };
  if (!isCurrent(input, dependencies.auth)) return summary;
  const completed = await completeAttempt(
    { attempt: pass.attempt, outcome: pass.outcome, input },
    dependencies,
  );
  return {
    ...completed,
    needsConfirmation: completed.needsConfirmation + pass.confirmations,
  };
};
