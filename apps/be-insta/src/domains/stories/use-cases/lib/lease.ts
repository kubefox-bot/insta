import { StoryErrorCode } from "@insta/contracts/errors";
import { storyPolicy } from "../../domain/conts";
import type { UploadClaim } from "../../domain/types";
import type { StoryUploads } from "../../ports/persistence/interfaces";
/**
 * Владеет heartbeat, deadline и связью с внешней отменой upload; renew выполняет
 * последовательно и при потере lease запрашивает durable отмену.
 */
export const ownUploadLease = ({
  claim,
  uploads,
  clock,
  external,
}: Readonly<{
  claim: UploadClaim;
  uploads: StoryUploads;
  clock: () => number;
  external: AbortSignal | undefined;
}>) => {
  const cancellation = new AbortController();
  let cancellationTask: Promise<boolean> | undefined;
  let heartbeatTask = Promise.resolve();
  let stopped = false;
  /**
   * Сигнализирует остановку upload и однократно запускает CAS-отмену claim;
   * неподтверждённый исход сохраняет как false для восстановления.
   */
  const cancel = () => {
    cancellation.abort();
    // An unacknowledged CAS leaves durable accounting for reconciliation.
    cancellationTask ??= uploads
      .cancel({ ...claim, code: StoryErrorCode.UploadCancelled })
      .then(
        () => true,
        () => false,
      );
  };
  external?.addEventListener("abort", cancel, { once: true });
  if (external?.aborted) cancel();
  const deadline = setTimeout(
    cancel,
    Math.max(0, storyPolicy.requestMs - (clock() - claim.now)),
  );
  const heartbeat = setInterval(() => {
    heartbeatTask = heartbeatTask.then(async () => {
      if (stopped || cancellation.signal.aborted) return;
      try {
        if (
          !(await uploads.renew({
            ...claim,
            now: clock(),
            leaseUntil: clock() + storyPolicy.leaseMs,
          }))
        )
          cancel();
      } catch {
        cancel();
      }
    });
    heartbeatTask.catch(() => undefined);
  }, storyPolicy.heartbeatMs);
  return {
    signal: cancellation.signal,
    /**
     * Останавливает heartbeat и таймеры, снимает внешний listener и ждёт renew/отмену.
     * Само закрытие не создаёт новую durable отмену после успешной публикации.
     */
    close: async () => {
      stopped = true;
      cancellation.abort();
      clearTimeout(deadline);
      clearInterval(heartbeat);
      external?.removeEventListener("abort", cancel);
      await heartbeatTask;
      return await cancellationTask;
    },
  };
};
