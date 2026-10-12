import { expect, spyOn, test } from "bun:test";
import { mountListSynchronization } from "../../src/domains/conversations/browser/list/mount";

test("list mount requests only focus/visibility snapshots, allocates no periodic timer and removes listeners", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), {
    visibilityState: "visible",
  });
  Object.defineProperties(globalThis, {
    window: { value: window, configurable: true },
    document: { value: document, configurable: true },
  });
  const intervals = spyOn(globalThis, "setInterval");
  let reads = 0;
  let suspends = 0;
  let disposals = 0;
  try {
    const dispose = mountListSynchronization({
      synchronization: {
        refresh: async () => {
          reads++;
        },
        connected: async () => {},
        suspend: () => {
          suspends++;
        },
        dispose: () => {
          disposals++;
        },
      },
      onError: () => {
        throw new Error("Unexpected refresh failure");
      },
    });
    expect(reads).toBe(0);
    expect(intervals).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("focus"));
    expect(reads).toBe(1);
    document.visibilityState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(suspends).toBe(1);
    expect(reads).toBe(1);
    document.visibilityState = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(reads).toBe(2);
    dispose();
    expect(disposals).toBe(1);
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(reads).toBe(2);
    expect(intervals).not.toHaveBeenCalled();
  } finally {
    intervals.mockRestore();
    if (originalWindow)
      Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalDocument)
      Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
