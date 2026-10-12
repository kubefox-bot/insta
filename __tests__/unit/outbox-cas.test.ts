import { expect, test } from "bun:test";
import { removeSnapshot } from "../../apps/fe-insta/__tests__/fixtures/outbox/remove";

const expected = {
  ownerId: "owner",
  conversationId: "a".repeat(24),
  text: "retained draft",
  key: "key",
  clientMessageId: "client",
  operationId: "op",
  createdAt: 0,
  attempts: 1,
  nextAttemptAt: 10000,
  lastAuthGeneration: "g1",
  revision: 1,
  manualAttempt: false,
  state: "queued",
  needsConfirmation: false,
} as const;
test.each([
  { label: "revision", change: { revision: 3 } },
  { label: "generation", change: { lastAuthGeneration: "g2" } },
  { label: "owner", change: { ownerId: "other" } },
])(
  "confirmed delete refuses stale $label inside durable transaction",
  async ({ change }) => {
    const { result, deleted } = await removeSnapshot({
      expected,
      stored: { ...expected, ...change },
    });
    expect(result.isOk() && result.get()).toBe(false);
    expect(deleted).toBe(false);
  },
);
test("confirmed matching owner revision and generation removes exactly that snapshot", async () => {
  const { result, deleted } = await removeSnapshot({
    expected,
    stored: expected,
  });
  expect(result.isOk() && result.get()).toBe(true);
  expect(deleted).toBe(true);
});
