import { expect, test } from "bun:test";
import { createTracing } from "@insta/fe-core/observability/server";

test("canonical export derives IDs from the same owned OTel provider and denied mode cannot allocate a span", async () => {
  const tracing = createTracing();
  try {
    expect("effectContext" in tracing).toBe(true);
    if (!("effectContext" in tracing)) return;
    const first = tracing.effectContext({
      permission: "allowed",
      name: "test.commit",
      occurredAt: Date.now(),
    });
    const second = tracing.effectContext({
      permission: "allowed",
      name: "test.commit",
      occurredAt: Date.now(),
    });
    expect(first?.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(first?.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(second?.traceId).not.toBe(first?.traceId);
    expect(
      tracing.effectContext({
        permission: "denied",
        name: "test.commit",
        occurredAt: Date.now(),
      }),
    ).toBeUndefined();
    await tracing.close();
    expect(
      tracing.effectContext({
        permission: "allowed",
        name: "test.commit",
        occurredAt: Date.now(),
      }),
    ).toBeUndefined();
  } finally {
    await tracing.close();
  }
});
