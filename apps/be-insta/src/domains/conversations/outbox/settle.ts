import type { PublicationOutcome } from "../ports/delivery/types";
import { outboxPolicy } from "./conts";
/** Shared publication lifetime for the message and receipt outboxes. The caller
 * retains its claim and slot until the sink has actually released its resources. */
export const settlePublication = async ({
  publish,
  complete,
  expire,
  fail,
  attempts,
  clock,
  signal,
}: Readonly<{
  publish: (signal: AbortSignal) => Promise<void> | Promise<PublicationOutcome>;
  expire?: (now: number) => Promise<boolean>;
  complete: (now: number) => Promise<boolean>;
  fail: (nextAttemptAt: number) => Promise<boolean>;
  attempts: number;
  clock: () => number;
  signal?: AbortSignal;
}>) => {
  const controller = new AbortController();
  const publicationSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;
  const timeout = setTimeout(
    () => controller.abort(new Error("Outbox attempt timed out")),
    outboxPolicy.attemptTimeoutMs,
  );
  try {
    publicationSignal.throwIfAborted();
    const outcome = await publish(publicationSignal);
    clearTimeout(timeout);
    publicationSignal.throwIfAborted();
    if (outcome?.kind === "expired") {
      if (!expire)
        throw new Error("Expired publication has no settlement owner");
      await expire(clock());
    } else await complete(clock());
  } catch {
    const delayMs = Math.min(
      outboxPolicy.retryMaximumMs,
      outboxPolicy.retryBaseMs * 2 ** (attempts - 1),
    );
    await fail(clock() + delayMs);
  } finally {
    clearTimeout(timeout);
  }
};
