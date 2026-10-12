import { createLogOnlySink } from "@insta/fe-core/observability/analytics";
import {
  analyticsSinkNames,
  createOtlpSink,
  startCanonicalAnalytics,
} from "../../../lib/observability/analytics/index";
import type { RuntimeObservability } from "../../../lib/observability/index";
import type { AnalyticsDependencies } from "./types";
/** Запускает analytics worker только с runtime-наблюдаемостью; OTLP sink создаётся при настроенном receiver. */
export const attachAnalytics = ({
  dependencies,
  observability,
}: Readonly<{
  dependencies: AnalyticsDependencies | undefined;
  observability: RuntimeObservability | undefined;
}>) => {
  if (!dependencies || !observability) return undefined;
  const logOnly = createLogOnlySink({
    /** Передаёт разрешённую analytics-проекцию в runtime logger без самостоятельного бизнес-решения. */
    emit: (record) => observability.adapter.logger.info(record),
  });
  const otel = dependencies.receiver
    ? createOtlpSink({
        endpoint: dependencies.receiver,
        /** Создаёт trace context для уже разрешённого dispatcher-ом analytics-эффекта с исходным временем события. */
        traceEffect: (event) =>
          observability.tracing.effectContext({
            permission: "allowed",
            name: event.operation,
            occurredAt: event.occurredAt,
          }),
      })
    : undefined;
  const worker = startCanonicalAnalytics({
    outboxes: dependencies.outboxes,
    permission: dependencies.permission,
    sinks: { [analyticsSinkNames.logOnly]: logOnly, ...(otel ? { otel } : {}) },
    clock: Date.now,
    /** Оставляет необязательную analytics-проекцию pending при сбое, не изменяя persisted бизнес-результат. */
    onError: () => {
      /* Optional projection remains pending; persisted business is independent. */
    },
  });
  return {
    /** Останавливает analytics worker и закрывает OTLP sink даже при ошибке остановки worker. */
    close: async () => {
      try {
        await worker.close();
      } finally {
        await otel?.close();
      }
    },
  };
};
