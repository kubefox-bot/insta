import { expect, test } from "bun:test";
import { advanceReceipt } from "../../../../src/domains/conversations/domain/receipts/transition";
import type { ReceiptState } from "../../../../src/domains/conversations/domain/receipts/types";

test("recipient delivery records server time without mutating caller state", () => {
  const current = Object.freeze({ deliveredAt: null, readAt: null });
  expect(advanceReceipt({ current, status: "delivered", nowMs: 100 })).toEqual({
    deliveredAt: 100,
    readAt: null,
  });
  expect(current).toEqual({ deliveredAt: null, readAt: null });
});

test("read also records delivery when no previous receipt exists", () => {
  expect(
    advanceReceipt({
      current: { deliveredAt: null, readAt: null },
      status: "read",
      nowMs: 100,
    }),
  ).toEqual({ deliveredAt: 100, readAt: 100 });
});

test("delivery after read preserves the original delivered and read timestamps", () => {
  expect(
    advanceReceipt({
      current: { deliveredAt: 100, readAt: 200 },
      status: "delivered",
      nowMs: 300,
    }),
  ).toEqual({ deliveredAt: 100, readAt: 200 });
});

test("replayed acknowledgments preserve the first timestamps", () => {
  const cases: readonly Readonly<{
    current: ReceiptState;
    status: "delivered" | "read";
  }>[] = [
    { current: { deliveredAt: 100, readAt: null }, status: "delivered" },
    { current: { deliveredAt: 100, readAt: 200 }, status: "read" },
  ];
  for (const { current, status } of cases) {
    expect(advanceReceipt({ current, status, nowMs: 400 })).toEqual(current);
  }
});

test("read after delivery preserves delivery time and records later server time", () => {
  expect(
    advanceReceipt({
      current: { deliveredAt: 100, readAt: null },
      status: "read",
      nowMs: 200,
    }),
  ).toEqual({ deliveredAt: 100, readAt: 200 });
});

test("clock rollback clamps read time to delivery and preserves zero timestamps", () => {
  expect(
    advanceReceipt({
      current: { deliveredAt: 100, readAt: null },
      status: "read",
      nowMs: 50,
    }),
  ).toEqual({ deliveredAt: 100, readAt: 100 });
  expect(
    advanceReceipt({
      current: { deliveredAt: 0, readAt: 0 },
      status: "read",
      nowMs: 100,
    }),
  ).toEqual({ deliveredAt: 0, readAt: 0 });
});
