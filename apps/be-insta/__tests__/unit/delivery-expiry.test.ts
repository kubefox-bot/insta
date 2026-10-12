import { expect, test } from "bun:test";
import { settlePublication } from "../../src/domains/conversations/outbox/settle";

test("expired publication settles recovery without claiming successful publication", async () => {
  const transitions: string[] = [];
  await settlePublication({
    publish: async () => ({ kind: "expired" as const }),
    complete: async () => {
      transitions.push("published");
      return true;
    },
    expire: async () => {
      transitions.push("expired");
      return true;
    },
    fail: async () => {
      transitions.push("retry");
      return true;
    },
    attempts: 1,
    clock: () => 100,
  });
  expect(transitions).toEqual(["expired"]);
});
