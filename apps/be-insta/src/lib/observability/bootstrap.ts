import {
  createPinoAdapter,
  createTracing,
} from "@insta/fe-core/observability/server";
import { identity } from "./conts";
import type { ObservabilityOptions, RuntimeObservability } from "./types";
/** Создаёт tracing и Pino runtime; владелец обязан дождаться close для завершения traces и flush журналов. */
export const createObservability = (
  options: Extract<ObservabilityOptions, { mode: "runtime" }>,
): RuntimeObservability => {
  const adapter = createPinoAdapter({
    identity,
    level: options.level,
    flushTimeoutMs: options.flushTimeoutMs,
    ...(options.destination ? { destination: options.destination } : {}),
  });
  const tracing = createTracing();
  let closing: Promise<void> | undefined;
  return {
    adapter,
    tracing,
    /** Один раз закрывает tracing и затем logger; неуспешный flush отдельно сообщается в stderr. */
    close: () => {
      closing ??= tracing.close().finally(async () => {
        const result = await adapter.close();
        if (result !== "flushed")
          process.stderr.write(`Observability shutdown ${result}\n`);
      });
      return closing;
    },
  };
};
