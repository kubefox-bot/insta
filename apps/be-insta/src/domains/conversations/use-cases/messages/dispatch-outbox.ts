import { outboxPolicy, outboxSinks } from "../../outbox/conts";
import { deliverOutboxClaim } from "../../outbox/deliver";
import type { MessageOutbox, MessageSinks } from "../../ports/outbox";
/**
 * Распределяет ограниченную пачку claims между подключёнными sinks волнами; после abort
 * не начинает новую волну, текущую полностью дожидается перед пробросом ошибки.
 */
export const dispatchMessageOutbox = async (
  input: Readonly<{
    outbox: MessageOutbox;
    sinks: MessageSinks;
    clock: () => number;
    uuid: () => string;
    signal?: AbortSignal;
  }>,
) => {
  const active = outboxSinks.flatMap((sink) => {
    const publish = input.sinks[sink];
    return publish === undefined ? [] : [{ sink, publish }];
  });
  if (!active.length) return;
  const attempts = Array.from(
    { length: outboxPolicy.maxBatch },
    (_, index) => active[index % active.length],
  );
  for (
    let offset = 0;
    offset < attempts.length;
    offset += outboxPolicy.concurrency
  ) {
    if (input.signal?.aborted) return;
    const wave = attempts
      .slice(offset, offset + outboxPolicy.concurrency)
      .map(async (candidate) => {
        if (!candidate) throw new Error("Missing outbox sink");
        const claim = await input.outbox.claim({
          sink: candidate.sink,
          now: input.clock(),
          leaseId: input.uuid(),
        });
        if (claim)
          await deliverOutboxClaim({
            ...input,
            claim,
            publish: candidate.publish,
          });
      });
    // Drain the whole acquired wave before propagating provider failure.
    const results = await Promise.allSettled(wave);
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }
};
