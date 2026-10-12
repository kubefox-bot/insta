import type { LogRecord } from "../contracts/types";
import { boundLabels } from "./bound-labels";
import {
  defaultCatalog,
  MILLISECONDS_PER_SECOND,
  metricNames,
  TERMINAL_OUTCOMES,
} from "./conts";
import { readBusinessMetric } from "./read-business-metric";
import type {
  BusinessMetric,
  CounterPort,
  HistogramPort,
  MetricCatalog,
  OtelMeterPort,
} from "./types";

/** Записывает event в отдельный счётчик, пропускает pending, остальные исходы считает как операции; terminal duration переводит из миллисекунд в секунды. */
const recordBusinessMetric = (
  metric: Required<Pick<BusinessMetric, "attributes">> & BusinessMetric,
  ports: Readonly<{
    operations: CounterPort;
    events: CounterPort;
    durations: HistogramPort;
  }>,
): void => {
  const { attributes, durationMs } = metric;
  if (attributes.outcome === "event") {
    ports.events.add(1, attributes);
    return;
  }
  if (attributes.outcome === "pending") return;
  ports.operations.add(1, attributes);
  if (
    !TERMINAL_OUTCOMES.includes(attributes.outcome) ||
    durationMs === undefined
  )
    return;
  ports.durations.record(durationMs / MILLISECONDS_PER_SECOND, attributes);
};

/** Создаёт business counters и histogram в заимствованном meter; возвращает адаптер проекции логов, не владеющий shutdown самого meter. */
export const createOtelBusinessMetricsAdapter = (
  meter: OtelMeterPort,
  options: Readonly<{ catalog?: MetricCatalog }> = {},
) => {
  const operations = meter.createCounter(metricNames.operations);
  const events = meter.createCounter(metricNames.events);
  const violations = meter.createCounter(metricNames.violations);
  const durations = meter.createHistogram(metricNames.durations);
  const ports = { durations, events, operations };
  return {
    /** Принимает только business logs, считает отсутствие обязательных полей нарушением и ограничивает labels перед записью метрик. */
    emit(record: LogRecord): void {
      const metric = readBusinessMetric(record);
      if (!metric) return;
      if (!metric.attributes) {
        violations.add(1, { violation: "invalid_business_record" });
        return;
      }
      const attributes = boundLabels({
        attributes: metric.attributes,
        catalog: options.catalog ?? defaultCatalog,
      });
      recordBusinessMetric({ ...metric, attributes }, ports);
    },
  };
};
