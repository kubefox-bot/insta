import { Result } from "@bloodyowl/boxed";
import { SessionErrorCode } from "@insta/contracts/errors";
import { eligibility } from "../../../domain/transition";
import type { QueuedMessage, QueueError } from "../../../domain/types";
import { isCurrent } from "./current";
import type { PassDependencies, PassInput } from "./types";
/** Читает очередь, сохраняет необходимость подтверждения и выбирает первую допустимую отправку; смена владельца и ошибки записи прерывают подготовку. */
export const preparePass = async (
  input: PassInput,
  { queue, auth, clock }: PassDependencies,
): Promise<
  Result<
    Readonly<{
      record?: QueuedMessage;
      confirmations: number;
      nextAttemptAt?: number;
    }>,
    QueueError
  >
> => {
  const listed = await queue.list(input.ownerId);
  if (listed.isError()) return Result.Error(listed.getError());
  const now = clock?.() ?? input.now;
  const online = auth.online();
  const decisions = listed.get().map((record) => ({
    record,
    decision: eligibility({ ...input, record, now, online }),
  }));
  const confirmations = decisions.filter((item) => item.decision === "confirm");
  for (const { record } of confirmations) {
    if (!isCurrent(input, auth))
      return Result.Error(SessionErrorCode.ActorChanged);
    if (record.state === "confirmation") continue;
    const saved = await queue.update(
      {
        ...record,
        state: "confirmation",
        needsConfirmation: true,
        manualAttempt: false,
        revision: record.revision + 1,
      },
      record.revision,
    );
    if (saved.isError()) return Result.Error(saved.getError());
  }
  const waiting = decisions.filter(
    (item) =>
      online && item.decision === "wait" && item.record.state === "queued",
  );
  const nextAttemptAt = waiting.length
    ? Math.min(...waiting.map((item) => item.record.nextAttemptAt))
    : undefined;
  return Result.Ok({
    record: decisions.find((item) => item.decision === "send")?.record,
    confirmations: confirmations.length,
    nextAttemptAt,
  });
};
