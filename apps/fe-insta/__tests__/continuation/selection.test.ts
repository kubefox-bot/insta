import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { createContinuationSelection } from "../../src/domains/auth-continuation/browser/selection/create";

test("selection preserves page priority, suppresses unavailable/cancelled intents and remembers dismissal", async () => {
  const cancelled: (string | null)[] = [];
  const selection = createContinuationSelection({
    cancel: async (id) => {
      cancelled.push(id ?? null);
    },
  });
  const ready = {
    kind: "ready",
    intentId: "recovered",
    expiresAt: 1000,
  } as const;
  expect(
    selection.select({
      recovery: ready,
      projectedIntent: "page",
      cancelled: false,
      dismissedIntent: get(selection.view),
    }),
  ).toBe("page");
  expect(
    selection.select({
      recovery: ready,
      cancelled: false,
      dismissedIntent: get(selection.view),
    }),
  ).toBe("recovered");
  await selection.cancel("page");
  expect(cancelled).toEqual(["page"]);
  expect(
    selection.select({
      recovery: ready,
      projectedIntent: "page",
      cancelled: false,
      dismissedIntent: get(selection.view),
    }),
  ).toBeNull();
  expect(
    selection.select({
      recovery: ready,
      projectedIntent: "next",
      cancelled: false,
      dismissedIntent: get(selection.view),
    }),
  ).toBe("next");
  expect(
    selection.select({
      recovery: { kind: "unavailable" },
      projectedIntent: "next",
      cancelled: false,
      dismissedIntent: null,
    }),
  ).toBeNull();
  expect(
    selection.select({
      recovery: ready,
      cancelled: true,
      dismissedIntent: null,
    }),
  ).toBeNull();
});

test("cancellation dismisses immediately and preserves the original failure for UI cleanup reporting", async () => {
  const cancelled = Promise.withResolvers<void>();
  const failure = new Error("Synthetic cleanup failure");
  const selection = createContinuationSelection({
    cancel: () => cancelled.promise,
  });
  const completion = selection.cancel("chosen");
  expect(get(selection.view)).toBe("chosen");
  cancelled.reject(failure);
  await expect(completion).rejects.toBe(failure);
  expect(get(selection.view)).toBe("chosen");
});
