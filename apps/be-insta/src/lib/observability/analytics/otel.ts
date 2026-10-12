import { Result } from "@bloodyowl/boxed";
import type { GoalProjection } from "@insta/fe-core/observability/analytics";
import { analyticsPolicy } from "./conts";
import { encodeOtlpGoal } from "./otel-payload";
import type { EffectTracer } from "./types";

/** Отправляет OTLP payload и отменяет тело ответа; сетевой сбой, отмена или неуспешный HTTP дают sink_unavailable. */
const publishOtlp = async ({
  endpoint,
  event,
  signal,
  traceEffect,
}: Readonly<{
  endpoint: string;
  event: GoalProjection;
  signal: AbortSignal;
  traceEffect: EffectTracer;
}>): Promise<Result<"recorded", "sink_unavailable">> => {
  try {
    const context = traceEffect(event);
    if (!context) return Result.Error("sink_unavailable");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify(encodeOtlpGoal({ event, context })),
    });
    await response.body?.cancel();
    return response.ok
      ? Result.Ok("recorded")
      : Result.Error("sink_unavailable");
  } catch {
    return Result.Error("sink_unavailable");
  }
};
/** Создаёт OTLP sink с учётом pending-запросов; владелец должен закрыть его перед освобождением tracing. */
export const createOtlpSink = ({
  endpoint,
  traceEffect,
}: Readonly<{ endpoint: string; traceEffect: EffectTracer }>) => {
  const controllers = new Set<AbortController>();
  const pending = new Set<Promise<Result<"recorded", "sink_unavailable">>>();
  let closed = false;
  /** Запускает ограниченную дедлайном отправку, учитывая внешнюю отмену; после close новые события отклоняются. */
  const record = (
    event: GoalProjection,
    signal?: AbortSignal,
  ): Promise<Result<"recorded", "sink_unavailable">> => {
    if (closed) return Promise.resolve(Result.Error("sink_unavailable"));
    const controller = new AbortController();
    controllers.add(controller);
    const deadline = setTimeout(
      () => controller.abort(),
      analyticsPolicy.deadlineMs,
    );
    const operation = publishOtlp({
      endpoint,
      event,
      traceEffect,
      signal: signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal,
    }).finally(() => {
      clearTimeout(deadline);
      controllers.delete(controller);
    });
    pending.add(operation);
    operation.then(
      () => pending.delete(operation),
      () => pending.delete(operation),
    );
    return operation;
  };
  return {
    name: "otel",
    record,
    /** Запрещает новые OTLP-запросы, отменяет текущие и ждёт их фактического settlement. */
    close: async () => {
      closed = true;
      for (const controller of controllers) controller.abort();
      await Promise.allSettled([...pending]);
    },
  };
};
