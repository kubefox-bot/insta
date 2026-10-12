import { expect, test } from "bun:test";
import { writable } from "svelte/store";
import { createCreationDeparture } from "../../creation-departure/create";
import type { RecorderView } from "../../recorder/types";
import { createCreationSession } from "../create";

test("retained host restores route after close, then waits for rendered focus target", async () => {
  const events: string[] = [];
  const rendered = Promise.withResolvers<void>();
  const session = createCreationSession({
    authenticated: () => true,
    navigate: async () => {
      events.push("navigate");
    },
    replace: (path) => {
      events.push(path);
    },
    settled: () => rendered.promise,
    recorder: {
      open: async () => {
        events.push("open");
      },
      close: async () => {
        events.push("close");
      },
    },
  });
  session.retain({
    path: "/conversations/one",
    trigger: { isConnected: true, focus: () => events.push("focus") },
  });
  await session.open("/stories/new");
  const finished = session.finish();
  await Promise.resolve();
  await Promise.resolve();
  expect(events).toEqual([
    "/stories/new",
    "open",
    "close",
    "/conversations/one",
  ]);
  rendered.resolve();
  await finished;
  expect(events.at(-1)).toBe("focus");
  expect(session.hasHost()).toBe(false);
});

test("navigation owns allowance until settlement and clears it on rejected navigation", async () => {
  const navigation = Promise.withResolvers<void>();
  const session = createCreationSession({
    authenticated: () => false,
    navigate: () => navigation.promise,
    replace: () => {},
    settled: async () => {},
    recorder: { open: async () => {}, close: async () => {} },
  });
  session.retain({ path: "/", trigger: null });
  const leaving = session.leave("/conversations");
  expect(session.isNavigating()).toBe(true);
  expect(session.hasHost()).toBe(false);
  navigation.reject(new Error("navigation failed"));
  await expect(leaving).rejects.toThrow("navigation failed");
  expect(session.isNavigating()).toBe(false);
});

test("disconnected host trigger is never focused on return", async () => {
  const events: string[] = [];
  const session = createCreationSession({
    authenticated: () => true,
    navigate: async () => {},
    replace: (path) => {
      events.push(path);
    },
    settled: async () => {},
    recorder: { open: async () => {}, close: async () => {} },
  });
  session.retain({
    path: "/",
    trigger: {
      isConnected: false,
      focus: () => {
        throw new Error("detached focus");
      },
    },
  });
  await session.returnToHost();
  expect(events).toEqual(["/"]);
});

test("confirmed departure owns one close before session returns to host", async () => {
  const events: string[] = [];
  const recorder = {
    view: writable<RecorderView>({ kind: "preview", url: "blob:preview" }),
    hasPendingPublication: () => false,
    open: async () => {},
    close: async () => {
      events.push("close");
    },
  };
  const session = createCreationSession({
    authenticated: () => true,
    navigate: async () => {},
    replace: () => {
      events.push("return");
    },
    settled: async () => {},
    recorder,
  });
  session.retain({ path: "/", trigger: null });
  const departure = createCreationDeparture({
    recorder,
    hasPreview: () => true,
    finish: session.returnToHost,
  });
  await departure.request();
  expect(events).toEqual([]);
  await departure.confirm();
  expect(events).toEqual(["close", "return"]);
});
