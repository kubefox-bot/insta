import { Result } from "@bloodyowl/boxed";
import { SessionErrorCode } from "@insta/contracts/errors";
import type { QueueError } from "../domain/types";
import type { OutboxAuth } from "../ports/auth";
import type { Queue } from "../ports/queue";
import { reconcileActor } from "./lib/drain/reconcile";
/** После сверки auth переводит только выбранные confirmation-записи в одну ручную попытку через ревизионные обновления; допускает частичный прогресс до ошибки. */
export const confirmResume = async (
  {
    ownerId,
    operationIds,
  }: Readonly<{ ownerId: string; operationIds: readonly string[] }>,
  {
    queue,
    auth,
    signal,
  }: Readonly<{ queue: Queue; auth: OutboxAuth; signal?: AbortSignal }>,
): Promise<Result<number, QueueError>> => {
  const checked = await reconcileActor({ auth, signal });
  if (checked.isError()) return Result.Error(checked.getError());
  const actor = auth.current();
  if (actor?.ownerId !== ownerId)
    return Result.Error(SessionErrorCode.ActorChanged);
  const listed = await queue.list(ownerId);
  if (listed.isError()) return Result.Error(listed.getError());
  /** Проверяет отмену, владельца и поколение перед очередной записью подтверждения и итоговым результатом. */
  const current = () => {
    const active = auth.current();
    return (
      !signal?.aborted &&
      active?.ownerId === ownerId &&
      active.generation === actor.generation
    );
  };
  const selected = new Set(operationIds);
  let count = 0;
  const pending = listed
    .get()
    .filter(
      (record) =>
        selected.has(record.operationId) && record.state === "confirmation",
    );
  for (const record of pending) {
    if (!current()) return Result.Error(SessionErrorCode.ActorChanged);
    const saved = await queue.update(
      {
        ...record,
        state: "queued",
        needsConfirmation: false,
        manualAttempt: true,
        nextAttemptAt: 0,
        lastAuthGeneration: actor.generation,
        revision: record.revision + 1,
      },
      record.revision,
      { signal },
    );
    if (saved.isError()) return Result.Error(saved.getError());
    count += Number(saved.get());
  }
  return current()
    ? Result.Ok(count)
    : Result.Error(SessionErrorCode.ActorChanged);
};
