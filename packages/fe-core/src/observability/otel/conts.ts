export const TERMINAL_OUTCOMES: readonly string[] = [
  "failed",
  "rejected",
  "succeeded",
];
export const MILLISECONDS_PER_SECOND = 1000;
export const METRIC_OUTCOMES: readonly string[] = [
  "attempted",
  "event",
  "failed",
  "pending",
  "rejected",
  "succeeded",
];
export const defaultCatalog = { operations: [], codes: [] } as const;
export const metricNames = {
  operations: "business_operation_total",
  events: "business_operation_event_total",
  violations: "business_instrumentation_violation_total",
  durations: "business_operation_duration_seconds",
} as const;
