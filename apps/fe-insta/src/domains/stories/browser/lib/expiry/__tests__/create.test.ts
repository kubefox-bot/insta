import { expect, test } from "bun:test";
import { createExpiry } from "../create";

test("long expiry uses bounded chunks and rechecks clock jumps and release", () => {
  let now = 1000;
  let callback = () => {};
  const delays: number[] = [];
  let expired = 0;
  let cancelled = 0;
  const expiry = createExpiry({
    now: () => now,
    schedule: (next, delay) => {
      callback = next;
      delays.push(delay);
      return () => {
        cancelled++;
      };
    },
  });
  expiry.schedule({
    expiresAt: 3000001000,
    expire: () => {
      expired++;
    },
  });
  expect(delays).toEqual([2147483647]);
  now = 500;
  callback();
  expect(expired).toBe(0);
  expect(delays).toEqual([2147483647, 2147483647]);
  now = 3000001000;
  callback();
  expect(expired).toBe(1);
  expiry.schedule({
    expiresAt: now + 100,
    expire: () => {
      expired++;
    },
  });
  const stale = callback;
  expiry.release();
  stale();
  expect(expired).toBe(1);
  expect(cancelled).toBeGreaterThan(0);
});
