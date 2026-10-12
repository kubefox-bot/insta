import { afterEach, expect, jest, test } from "bun:test";
import { getEventListeners } from "node:events";
import { observeCssHmr } from "./lib/hmr/observe";

class SyntheticSocket extends EventTarget {
  closed = false;

  close() {
    this.closed = true;
    this.dispatchEvent(new Event("close"));
  }
}

afterEach(() => jest.useRealTimers());

const expectReleased = (socket: SyntheticSocket) => {
  expect(socket.closed).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
  for (const event of ["open", "message", "error", "close"])
    expect(getEventListeners(socket, event)).toEqual([]);
};

test("HMR setup rejection releases pending update and preserves the original failure", async () => {
  jest.useFakeTimers();
  const socket = new SyntheticSocket();
  const original = new Error("Synthetic transformRequest failure");
  const unhandled: unknown[] = [];
  const listener = (error: unknown) => unhandled.push(error);
  process.on("unhandledRejection", listener);
  try {
    const observation = observeCssHmr({
      socket,
      timeoutMs: 100,
      change: async () => {
        throw original;
      },
    });
    const outcome = observation.then(
      (value) => value,
      (error: unknown) => error,
    );
    socket.dispatchEvent(new Event("open"));
    expect(await outcome).toBe(original);
    expectReleased(socket);
    jest.advanceTimersByTime(200);
    await Promise.resolve();
    expect(unhandled).toEqual([]);
  } finally {
    process.off("unhandledRejection", listener);
  }
});

test("HMR bounds a stalled socket opening and removes every listener", async () => {
  jest.useFakeTimers();
  const socket = new SyntheticSocket();
  const effects: string[] = [];
  const outcomes: unknown[] = [];
  const observation = observeCssHmr({
    socket,
    timeoutMs: 100,
    change: async () => {
      effects.push("changed");
    },
  });
  const settled = observation.then(
    (value) => outcomes.push(value),
    (error: unknown) => outcomes.push(error),
  );
  jest.advanceTimersByTime(100);
  await Promise.resolve();
  await Promise.resolve();
  expect(outcomes).toHaveLength(1);
  expect(outcomes[0]).toBeInstanceOf(Error);
  await settled;
  expectReleased(socket);
  socket.dispatchEvent(new Event("open"));
  jest.advanceTimersByTime(200);
  await Promise.resolve();
  expect(effects).toEqual([]);
});

test("HMR success waits for setup and update, then clears its lifecycle", async () => {
  jest.useFakeTimers();
  const socket = new SyntheticSocket();
  const setup = Promise.withResolvers<void>();
  const outcomes: string[] = [];
  const observation = observeCssHmr({
    socket,
    timeoutMs: 100,
    change: () => setup.promise,
  });
  const settled = observation.then((value) => outcomes.push(value));
  socket.dispatchEvent(new Event("open"));
  socket.dispatchEvent(
    new MessageEvent("message", {
      data: '{"type":"update","updates":[{"path":"/Fixture/index.svelte"}]}',
    }),
  );
  await Promise.resolve();
  expect(outcomes).toEqual([]);
  setup.resolve();
  await settled;
  expect(outcomes[0]).toContain("/Fixture/index.svelte");
  expectReleased(socket);
  jest.advanceTimersByTime(200);
  await Promise.resolve();
});
