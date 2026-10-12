import { expect, test } from "bun:test";
import * as transition from "../../../src/domains/conversations/domain/delivery/transition";

const sent = {
  subscriptionId: "a",
  streamId: "conversation:c",
  epoch: "e",
  cursor: 10,
};
const input = {
  expected: sent,
  failures: 0,
  retries: 0,
  nowMs: 0,
  expiresAt: 100000,
  random: 0,
  policy: {
    maxApplyFailures: 5,
    deliveryRetryBaseMs: 1000,
    deliveryRetryCapMs: 30000,
  },
};

test("only exact applied ACK advances; forged and partial replies cannot consume failure budget", () => {
  expect(
    transition.transitionDelivery?.({
      ...input,
      reply: { kind: "applied", position: sent },
    }),
  ).toMatchObject({ kind: "acked", failures: 0, retries: 0 });
  for (const position of [
    { ...sent, cursor: 9 },
    { ...sent, cursor: 11 },
    { ...sent, subscriptionId: "b" },
    { ...sent, streamId: "unread:c" },
    { ...sent, epoch: "old" },
  ]) {
    expect(
      transition.transitionDelivery({
        ...input,
        reply: { kind: "apply-failed", position },
      }),
    ).toMatchObject({ kind: "retry", failures: 0 });
  }
});

test("timeouts and retry-later preserve permanent failure budget; fifth permanent failure blocks", () => {
  expect(
    transition.transitionDelivery({
      ...input,
      failures: 4,
      retries: 20,
      reply: { kind: "timeout" },
    }),
  ).toMatchObject({ kind: "retry", failures: 4 });
  expect(
    transition.transitionDelivery({
      ...input,
      failures: 4,
      reply: { kind: "retry-later", position: sent, retryAfterMs: 60000 },
    }),
  ).toMatchObject({ kind: "retry", failures: 4, delayMs: 60000 });
  expect(
    transition.transitionDelivery({
      ...input,
      failures: 4,
      reply: { kind: "apply-failed", position: sent },
    }),
  ).toMatchObject({ kind: "blocked", failures: 5 });
  expect(
    transition.transitionDelivery({
      ...input,
      failures: 4,
      reply: { kind: "applied", position: sent },
    }),
  ).toMatchObject({ kind: "acked", failures: 0 });
});

test("backoff stays equal-jitter bounded and Retry-After waits only until retention expiry", () => {
  expect(
    transition.transitionDelivery({ ...input, reply: { kind: "timeout" } }),
  ).toMatchObject({ kind: "retry", delayMs: 500 });
  expect(
    transition.transitionDelivery({
      ...input,
      random: 1,
      retries: 100,
      reply: { kind: "timeout" },
    }),
  ).toMatchObject({ kind: "retry", delayMs: 30000 });
  expect(
    transition.transitionDelivery({
      ...input,
      expiresAt: 100,
      reply: { kind: "retry-later", position: sent, retryAfterMs: 60000 },
    }),
  ).toMatchObject({ kind: "retry", delayMs: 100 });
  expect(
    transition.transitionDelivery({
      ...input,
      nowMs: 100000,
      reply: { kind: "applied", position: sent },
    }),
  ).toMatchObject({ kind: "resync-required" });
});
