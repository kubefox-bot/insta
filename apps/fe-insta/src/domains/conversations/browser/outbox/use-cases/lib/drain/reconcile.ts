import { Result } from "@bloodyowl/boxed";
import { SessionErrorCode } from "@insta/contracts/errors";
import { authReadTimeoutMs } from "../../../domain/conts";
import type { QueueError } from "../../../domain/types";
import { createCancellation } from "../../../lib/cancellation/create";
import type { OutboxAuth } from "../../../ports/auth";
/** Ограничивает сверку auth таймаутом и отменой; различает смену владельца и недоступность auth, всегда освобождает ресурсы отмены. */
export const reconcileActor = async ({
  auth,
  signal,
}: Readonly<{ auth: OutboxAuth; signal?: AbortSignal }>): Promise<
  Result<undefined, QueueError>
> => {
  const cancellation = createCancellation({
    parent: signal,
    timeoutMs: authReadTimeoutMs,
  });
  try {
    await Promise.race([
      auth.reconcile({ signal: cancellation.signal }),
      cancellation.stopped,
    ]);
    if (cancellation.signal.aborted)
      return Result.Error(
        signal?.aborted
          ? SessionErrorCode.ActorChanged
          : SessionErrorCode.AuthUnavailable,
      );
    return Result.Ok(undefined);
  } catch {
    return Result.Error(
      signal?.aborted
        ? SessionErrorCode.ActorChanged
        : SessionErrorCode.AuthUnavailable,
    );
  } finally {
    cancellation.close();
  }
};
