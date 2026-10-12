import type { MessageOutbox, MessageSinks, OutboxClaim } from "../ports/outbox";
import { settlePublication } from "./settle";
/**
 * Связывает один message claim с общим publication lifetime, сохраняя event/sink/lease
 * при completion или retry.
 */
export const deliverOutboxClaim = ({
  outbox,
  claim,
  publish,
  clock,
  signal,
}: Readonly<{
  outbox: MessageOutbox;
  claim: OutboxClaim;
  publish: NonNullable<MessageSinks["realtime"]>;
  clock: () => number;
  signal?: AbortSignal;
}>) => {
  const expire = outbox.expire;
  return settlePublication({
    /**
     * Передаёт событие текущего claim sink с сигналом, которым владеет settlement
     * операции.
     */
    publish: (owned) => publish({ event: claim.event, signal: owned }),
    /** Подтверждает именно текущую аренду message sink в момент завершения публикации. */
    complete: (now) => outbox.complete({ ...claim, now }),
    /**
     * Переносит следующую попытку текущего message claim, сохраняя его lease identity для
     * условной записи.
     */
    fail: (nextAttemptAt) => outbox.fail({ ...claim, nextAttemptAt }),
    ...(claim.sink === "realtime" && expire
      ? { expire: (now: number) => expire({ ...claim, now }) }
      : {}),
    attempts: claim.attempts,
    clock,
    ...(signal ? { signal } : {}),
  });
};
