import { expect, test } from "bun:test";
import { createBrowserSynchronization } from "../../apps/fe-insta/src/domains/privacy/browser/synchronization";
import { createAuthSynchronization } from "../../apps/fe-insta/src/domains/users/browser/synchronization";

const withBrowser = async (
  execute: (browser: ReturnType<typeof fakeBrowser>) => Promise<void>,
) => {
  const originals = ["BroadcastChannel", "window", "navigator"].map((key) => ({
    key,
    descriptor: Object.getOwnPropertyDescriptor(globalThis, key),
  }));
  const browser = fakeBrowser();
  Object.defineProperty(globalThis, "BroadcastChannel", {
    configurable: true,
    value: browser.channelConstructor,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: browser.focus,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: browser.navigator,
  });
  try {
    await execute(browser);
  } finally {
    for (const { key, descriptor } of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
};
const fakeBrowser = () => {
  const channels: Channel[] = [];
  const focus = new EventTarget();
  const navigator: {
    locks?: {
      request: (
        name: string,
        execute: () => Promise<unknown>,
      ) => Promise<unknown>;
    };
  } = {};
  class Channel extends EventTarget {
    readonly notices: unknown[] = [];
    closes = 0;
    constructor(readonly name: string) {
      super();
      channels.push(this);
    }
    postMessage(data: unknown) {
      this.notices.push(data);
    }
    close() {
      this.closes += 1;
    }
    receive(data: unknown) {
      this.dispatchEvent(new MessageEvent("message", { data }));
    }
  }
  return { channelConstructor: Channel, channels, focus, navigator };
};

test("domain adapters preserve notice validation, focus, publication and missing locks", async () => {
  await withBrowser(async ({ channels, focus }) => {
    const logoutEvents: string[] = [];
    const auth = createAuthSynchronization();
    const privacy = createBrowserSynchronization();
    expect(channels).toHaveLength(0);
    const consent = { refreshes: 0 };
    const closeAuth = auth.subscribe(
      () => logoutEvents.push("refresh"),
      () => logoutEvents.push("logout"),
    );
    const closePrivacy = privacy.subscribe(() => {
      consent.refreshes += 1;
    });
    const [authChannel, privacyChannel] = channels;
    if (!authChannel || !privacyChannel) throw new Error("missing channels");
    authChannel.receive({ kind: "logout" });
    privacyChannel.receive("logout");
    expect(logoutEvents).toEqual([]);
    expect(consent.refreshes).toBe(0);
    authChannel.receive("logout");
    expect(logoutEvents).toEqual(["logout", "refresh"]);
    authChannel.receive("changed");
    privacyChannel.receive("changed");
    focus.dispatchEvent(new Event("focus"));
    expect(logoutEvents).toEqual(["logout", "refresh", "refresh", "refresh"]);
    expect(consent.refreshes).toBe(2);
    auth.publish();
    if (!auth.publishLogout) throw new Error("logout publication missing");
    auth.publishLogout();
    privacy.publish();
    expect(authChannel.notices).toEqual(["changed", "logout"]);
    expect(privacyChannel.notices).toEqual(["changed"]);
    await expect(auth.exclusive(async () => true)).rejects.toThrow(
      "Web Locks unavailable",
    );
    await expect(privacy.exclusive(async () => true)).rejects.toThrow(
      "Web Locks unavailable",
    );
    closeAuth();
    closePrivacy();
    focus.dispatchEvent(new Event("focus"));
    authChannel.receive("changed");
    privacyChannel.receive("changed");
    expect(consent.refreshes).toBe(2);
  });
});

test("old subscription cleanup retains newest channel and closes each resource once", async () => {
  await withBrowser(async ({ channels, focus }) => {
    for (const synchronization of [
      createAuthSynchronization(),
      createBrowserSynchronization(),
    ]) {
      const refreshed = { count: 0 };
      const old = synchronization.subscribe(() => {
        refreshed.count += 1;
      });
      const current = synchronization.subscribe(() => {
        refreshed.count += 1;
      });
      const previous = channels.at(-2);
      const newest = channels.at(-1);
      old();
      old();
      synchronization.publish();
      expect(previous?.closes).toBe(1);
      expect(previous?.notices).toEqual([]);
      expect(newest?.notices).toEqual(["changed"]);
      current();
      current();
      synchronization.publish();
      expect(newest?.closes).toBe(1);
      expect(newest?.notices).toEqual(["changed"]);
      focus.dispatchEvent(new Event("focus"));
      previous?.receive("changed");
      newest?.receive("changed");
      expect(refreshed.count).toBe(0);
    }
  });
});

test("common channel rolls back partial setup and publication after close is inert", async () => {
  const { openBrowserChannel } = await import(
    "../../apps/fe-insta/src/lib/browser-synchronization"
  );
  await withBrowser(async ({ channels, focus }) => {
    const events: unknown[] = [];
    const channel = openBrowserChannel({
      name: "test",
      onMessage: (data) => events.push(data),
      onFocus: () => events.push("focus"),
    });
    channels[0]?.receive({ notice: "unknown" });
    expect(events).toEqual([{ notice: "unknown" }]);
    channel.close();
    channel.close();
    channel.publish("closed");
    expect(channels[0]?.closes).toBe(1);
    expect(channels[0]?.notices).toEqual([]);
    const original = focus.addEventListener.bind(focus);
    focus.addEventListener = (...args) => {
      original(...args);
      throw new Error("focus setup failed");
    };
    expect(() =>
      openBrowserChannel({
        name: "broken",
        onMessage: () => events.push("message"),
        onFocus: () => events.push("focus"),
      }),
    ).toThrow("focus setup failed");
    expect(channels[1]?.closes).toBe(1);
    focus.dispatchEvent(new Event("focus"));
    channels[1]?.receive("changed");
    expect(events).toEqual([{ notice: "unknown" }]);
  });
});

test("locks retain the requested domain name and propagate results and failures", async () => {
  await withBrowser(async ({ navigator }) => {
    const names: string[] = [];
    navigator.locks = {
      request: async (name, execute) => {
        names.push(name);
        return execute();
      },
    };
    expect(await createAuthSynchronization().exclusive(async () => 17)).toBe(
      17,
    );
    const failure = new Error("mutation failed");
    await expect(
      createBrowserSynchronization().exclusive(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(names).toEqual(["insta/auth/mutation", "insta/privacy/change"]);
  });
});

test("overlapping subscriptions own focus listeners even with the same callback", async () => {
  await withBrowser(async ({ focus }) => {
    for (const synchronization of [
      createAuthSynchronization(),
      createBrowserSynchronization(),
    ]) {
      const state = { refreshes: 0 };
      const refresh = () => {
        state.refreshes += 1;
      };
      const old = synchronization.subscribe(refresh);
      const current = synchronization.subscribe(refresh);
      old();
      focus.dispatchEvent(new Event("focus"));
      expect(state.refreshes).toBe(1);
      current();
      focus.dispatchEvent(new Event("focus"));
      expect(state.refreshes).toBe(1);
    }
  });
});

test("message listener setup failure closes the acquired channel", async () => {
  const { openBrowserChannel } = await import(
    "../../apps/fe-insta/src/lib/browser-synchronization"
  );
  await withBrowser(async ({ channelConstructor, channels, focus }) => {
    const events: string[] = [];
    const original = channelConstructor.prototype.addEventListener;
    channelConstructor.prototype.addEventListener = function (...args) {
      original.call(this, ...args);
      throw new Error("message setup failed");
    };
    expect(() =>
      openBrowserChannel({
        name: "broken",
        onMessage: () => events.push("message"),
        onFocus: () => events.push("focus"),
      }),
    ).toThrow("message setup failed");
    expect(channels[0]?.closes).toBe(1);
    channels[0]?.receive("changed");
    focus.dispatchEvent(new Event("focus"));
    expect(events).toEqual([]);
  });
});
