import { describe, expect, it } from "bun:test";
import { logFields } from "../../../src/observability/contracts/conts";
import { createOtelBusinessMetricsAdapter } from "../../../src/observability/otel/index";

describe("createOtelBusinessMetricsAdapter", () => {
  it("keeps pending observations out of operation totals and durations", () => {
    const counterCalls: unknown[][] = [];
    const histogramCalls: unknown[][] = [];
    const adapter = createOtelBusinessMetricsAdapter(
      {
        createCounter: (name) => ({
          add: (value, attributes) =>
            counterCalls.push([name, value, attributes]),
        }),
        createHistogram: (name) => ({
          record: (value, attributes) =>
            histogramCalls.push([name, value, attributes]),
        }),
      },
      { catalog: { operations: ["news.related"], codes: ["OK"] } },
    );

    adapter.emit({
      [logFields.schemaVersion]: 2,
      app: "dc",
      [logFields.serviceName]: "fe-dc",
      source: "next",
      [logFields.eventType]: "business_operation",
      level: "info",
      business: { operation: "news.related", outcome: "pending", code: "OK" },
      http: { [logFields.durationMs]: 250 },
    });

    expect(counterCalls).toEqual([]);
    expect(histogramCalls).toEqual([]);
  });

  it("records attempted and terminal operations without double-counting duration", () => {
    const counterCalls: unknown[][] = [];
    const histogramCalls: unknown[][] = [];
    const adapter = createOtelBusinessMetricsAdapter(
      {
        createCounter: (name) => ({
          add: (value, attributes) =>
            counterCalls.push([name, value, attributes]),
        }),
        createHistogram: (name) => ({
          record: (value, attributes) =>
            histogramCalls.push([name, value, attributes]),
        }),
      },
      { catalog: { operations: ["news.related"], codes: ["OK"] } },
    );

    adapter.emit({
      [logFields.schemaVersion]: 2,
      app: "dc",
      [logFields.serviceName]: "fe-dc",
      source: "next",
      [logFields.eventType]: "business_operation",
      level: "debug",
      business: { operation: "news.related", outcome: "attempted" },
    });
    adapter.emit({
      [logFields.schemaVersion]: 2,
      app: "dc",
      [logFields.serviceName]: "fe-dc",
      source: "next",
      [logFields.eventType]: "business_operation",
      level: "info",
      business: {
        operation: "news.related",
        outcome: "succeeded",
        code: "OK",
      },
      http: { [logFields.durationMs]: 250 },
    });

    expect(counterCalls).toEqual([
      [
        "business_operation_total",
        1,
        { code: "unknown", operation: "news.related", outcome: "attempted" },
      ],
      [
        "business_operation_total",
        1,
        { code: "OK", operation: "news.related", outcome: "succeeded" },
      ],
    ]);
    expect(histogramCalls).toEqual([
      [
        "business_operation_duration_seconds",
        0.25,
        { code: "OK", operation: "news.related", outcome: "succeeded" },
      ],
    ]);
  });
});

it("bounded catalog excludes identifiers and normalizes unknown operations, outcomes and codes", () => {
  const labels: unknown[] = [];
  const adapter = createOtelBusinessMetricsAdapter(
    {
      createCounter: () => ({
        add: (_value, attributes) => {
          labels.push(attributes);
        },
      }),
      createHistogram: () => ({ record: () => undefined }),
    },
    { catalog: { operations: ["countries.load"], codes: ["SUCCESS"] } },
  );
  const base = {
    [logFields.schemaVersion]: 2 as const,
    app: "hap",
    [logFields.serviceName]: "fe-hap",
    source: "next",
    [logFields.eventType]: "business_operation",
    level: "info" as const,
  };
  adapter.emit({
    ...base,
    [logFields.operationId]: crypto.randomUUID(),
    [logFields.requestId]: crypto.randomUUID(),
    business: {
      operation: "countries.load",
      outcome: "succeeded",
      code: "SUCCESS",
    },
  });
  adapter.emit({
    ...base,
    [logFields.operationId]: crypto.randomUUID(),
    [logFields.requestId]: crypto.randomUUID(),
    business: {
      operation: "countries.load",
      outcome: "succeeded",
      code: "SUCCESS",
    },
  });
  adapter.emit({
    ...base,
    business: {
      operation: "/user/private",
      outcome: "arbitrary",
      code: "private-value",
    },
  });
  expect(labels[0]).toEqual(labels[1]);
  expect(labels[2]).toEqual({
    operation: "unknown",
    outcome: "unknown",
    code: "unknown",
  });
});
