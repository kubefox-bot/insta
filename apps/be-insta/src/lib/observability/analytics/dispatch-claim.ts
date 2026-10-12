import type { GoalSink } from "@insta/fe-core/observability/analytics";
import { dispatchGoal } from "@insta/fe-core/observability/analytics";
import { analyticsPolicy, dispatchSuccessStates } from "./conts";
import type {
  AnalyticsClaim,
  AnalyticsWorkerOptions,
  CanonicalOutbox,
} from "./types";
/** Доставляет цель с проверкой согласия и дедлайном; claim освобождается лишь после settlement sink, таймер очищается всегда. */
export const dispatchCanonicalClaim = async ({
  claim,
  outbox,
  sink,
  permission,
  clock,
  signal,
}: Readonly<{
  claim: AnalyticsClaim;
  outbox: CanonicalOutbox;
  sink: GoalSink;
  permission: AnalyticsWorkerOptions["permission"];
  clock: () => number;
  signal?: AbortSignal;
}>) => {
  const controller = new AbortController();
  const deadline = setTimeout(
    () => controller.abort(),
    analyticsPolicy.deadlineMs,
  );
  try {
    // Cancellation requests do not release ownership until actual sink cleanup settles.
    const result = await dispatchGoal({
      record: claim.record,
      mapping: claim.mapping,
      sink,
      permission,
      signal: signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal,
    });
    if (result.isError()) {
      await outbox.retry({ claim, now: clock() });
      return "retry" as const;
    }
    const finished = await outbox.finish({
      claim,
      state: dispatchSuccessStates[result.get()],
      now: clock(),
    });
    return finished ? ("completed" as const) : ("retry" as const);
  } finally {
    clearTimeout(deadline);
  }
};
