import { analyticsPolicy, analyticsSinks } from "./conts";
import { dispatchCanonicalClaim } from "./dispatch-claim";
import type {
  AnalyticsSinkName,
  AnalyticsWorkerOptions,
  CanonicalOutbox,
} from "./types";

/** Доставляет ограниченную партию одному sink; отсутствие sink, остановка или retry прекращают получение claims. */
const dispatchSink = async ({
  outbox,
  name,
  options,
  stopping,
  signal,
}: Readonly<{
  outbox: CanonicalOutbox;
  name: AnalyticsSinkName;
  options: AnalyticsWorkerOptions;
  stopping: () => boolean;
  signal?: AbortSignal;
}>) => {
  const sink = options.sinks[name];
  if (!sink) return;
  for (
    let index = 0;
    index < analyticsPolicy.batchSize && !stopping();
    index += 1
  ) {
    const claim = await outbox.claim({
      sink: name,
      now: options.clock(),
      leaseId: crypto.randomUUID(),
    });
    if (!claim) return;
    const outcome = await dispatchCanonicalClaim({
      claim,
      outbox,
      sink,
      permission: options.permission,
      clock: options.clock,
      ...(signal ? { signal } : {}),
    });
    if (outcome === "retry") {
      options.onError();
      return;
    }
  }
};
/** Обходит зарегистрированные outbox и sinks последовательно, проверяя остановку между направлениями доставки. */
export const dispatchAnalyticsWave = async ({
  options,
  stopping,
  signal,
}: Readonly<{
  options: AnalyticsWorkerOptions;
  stopping: () => boolean;
  signal?: AbortSignal;
}>) => {
  for (const outbox of options.outboxes)
    for (const name of analyticsSinks) {
      if (stopping()) return;
      await dispatchSink({
        outbox,
        name,
        options,
        stopping,
        ...(signal ? { signal } : {}),
      });
    }
};
