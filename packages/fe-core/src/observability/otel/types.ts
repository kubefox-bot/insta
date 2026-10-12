export type MetricAttributes = Record<string, string>;
export type MetricCatalog = Readonly<{
  operations: readonly string[];
  codes: readonly string[];
}>;
export type CounterPort = {
  add(value: number, attributes: MetricAttributes): void;
};
export type HistogramPort = {
  record(value: number, attributes: MetricAttributes): void;
};
export type OtelMeterPort = {
  createCounter(name: string): CounterPort;
  createHistogram(name: string): HistogramPort;
};

export type BusinessMetric = Readonly<{
  attributes?: MetricAttributes;
  durationMs?: number;
}>;
