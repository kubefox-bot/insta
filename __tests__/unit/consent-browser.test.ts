import { expect, test } from "bun:test";
import type { PublicPreference } from "@insta/contracts/privacy";
import { get } from "svelte/store";
import { createOptionalTelemetry } from "../../apps/fe-insta/src/domains/privacy/browser/optional-telemetry";
import { createPrivacyBrowser } from "../../apps/fe-insta/src/domains/privacy/browser/store";

const all: PublicPreference = {
  choice: "all",
  policyVersion: 1,
  revision: 1,
};
test("failed revocation stays locally denied, refresh cannot re-enable old all; functional queue survives", async () => {
  const functional = ["queued-message"];
  const optional: string[] = [];
  const ready = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const browser = createPrivacyBrowser({
    initial: all,
    preferences: {
      read: async () => all,
      save: async () => {
        await ready.promise;
        throw new Error("offline");
      },
    },
    telemetry: {
      start: async (state) => {
        if (state.choice === "all") {
          optional.push("started");
          started.resolve();
        }
      },
      stop: async () => {
        optional.splice(0);
      },
    },
    synchronization: {
      exclusive: async (execute) => execute(),
      publish: () => {},
      subscribe: () => () => {},
    },
  });
  const dispose = browser.mount();
  await started.promise;
  const revoke = browser.change("necessary");
  expect(get(browser.view).preference.choice).toBe("necessary");
  ready.resolve();
  await revoke;
  expect(get(browser.view).status).toBe("error");
  expect(optional).toHaveLength(0);
  await browser.refresh();
  expect(optional).toHaveLength(0);
  expect(functional).toEqual(["queued-message"]);
  dispose();
});
test("old all save response cannot enable telemetry after a queued local revoke", async () => {
  const first = Promise.withResolvers<PublicPreference>();
  const entered = Promise.withResolvers<void>();
  const optional: string[] = [];
  const saves = { count: 0 };
  const browser = createPrivacyBrowser({
    initial: { ...all, choice: "necessary" },
    preferences: {
      read: async () => all,
      save: async (input) => {
        saves.count += 1;
        if (saves.count === 1) {
          entered.resolve();
          return first.promise;
        }
        return { ...all, choice: input.choice, revision: 3 };
      },
    },
    telemetry: {
      start: async (state) => {
        if (state.choice === "all") optional.push("start");
      },
      stop: async () => {},
    },
    synchronization: {
      exclusive: async (execute) => execute(),
      publish: () => {},
      subscribe: () => () => {},
    },
  });
  const dispose = browser.mount();
  await browser.refresh();
  optional.splice(0);
  const save = browser.change("all");
  await entered.promise;
  const revoke = browser.change("necessary");
  await revoke;
  first.resolve({ ...all, revision: 2 });
  await save;
  expect(optional).toHaveLength(0);
  expect(get(browser.view).preference.choice).toBe("necessary");
  dispose();
});
test("focus revalidation cannot discard a confirmed in-flight choice", async () => {
  const saved = Promise.withResolvers<PublicPreference>();
  const entered = Promise.withResolvers<void>();
  const browser = createPrivacyBrowser({
    initial: { ...all, choice: "necessary" },
    preferences: {
      read: async () => ({ ...all, choice: "necessary" }),
      save: async () => {
        entered.resolve();
        return saved.promise;
      },
    },
    telemetry: { start: async () => {}, stop: async () => {} },
    synchronization: {
      exclusive: async (execute) => execute(),
      publish: () => {},
      subscribe: () => () => {},
    },
  });
  const dispose = browser.mount();
  const pending = browser.change("all");
  await entered.promise;
  await browser.refresh();
  saved.resolve({ ...all, revision: 2 });
  await pending;
  expect(get(browser.view).preference.choice).toBe("all");
  expect(get(browser.view).status).toBe("ready");
  dispose();
});
test("choice-needed UI state derives from normalized revision without another synchronized value", async () => {
  const initial: PublicPreference = {
    choice: "necessary",
    policyVersion: 1,
    revision: 0,
  };
  const browser = createPrivacyBrowser({
    initial,
    preferences: {
      read: async () => initial,
      save: async () => ({ ...initial, revision: 1 }),
    },
    telemetry: { start: async () => {}, stop: async () => {} },
    synchronization: {
      exclusive: async (execute) => execute(),
      publish: () => {},
      subscribe: () => () => {},
    },
  });
  expect(get(browser.view).needsChoice).toBe(true);
  await browser.change("necessary");
  expect(get(browser.view).needsChoice).toBe(false);
  expect(Object.keys(get(browser.view).preference).sort()).toEqual([
    "choice",
    "policyVersion",
    "revision",
  ]);
});

test("transient optional stop failure preserves server revoke and retries owned cleanup", async () => {
  const functional = ["queued-message"];
  const optional = ["queued-goal"];
  const adapterState = { active: false, stops: 0 };
  const telemetry = createOptionalTelemetry({
    adapters: [
      async () => ({
        start: () => {
          adapterState.active = true;
        },
        stop: () => {
          adapterState.stops += 1;
          if (adapterState.stops === 1) throw new Error("transient stop");
          adapterState.active = false;
        },
        clear: () => {
          optional.splice(0);
        },
      }),
    ],
  });
  await telemetry.start(all);
  const persisted = { preference: all, saves: 0 };
  const browser = createPrivacyBrowser({
    initial: all,
    preferences: {
      read: async () => persisted.preference,
      save: async (input) => {
        persisted.saves += 1;
        persisted.preference = {
          ...all,
          choice: input.choice,
          revision: persisted.saves + 1,
        };
        return persisted.preference;
      },
    },
    telemetry,
    synchronization: {
      exclusive: async (execute) => execute(),
      publish: () => {},
      subscribe: () => () => {},
    },
  });
  const first = browser.change("necessary");
  expect(get(browser.view).preference.choice).toBe("necessary");
  await first;
  expect(persisted.preference.choice).toBe("necessary");
  expect(persisted.saves).toBe(1);
  expect(get(browser.view).status).toBe("error");
  expect(adapterState.active).toBe(true);
  expect(optional).toHaveLength(0);
  await browser.change("necessary");
  expect(adapterState.stops).toBe(2);
  expect(adapterState.active).toBe(false);
  expect(persisted.saves).toBe(2);
  expect(get(browser.view).status).toBe("ready");
  expect(functional).toEqual(["queued-message"]);
});

test("server revocation persists before pending optional cleanup completes", async () => {
  const cleanup = Promise.withResolvers<void>();
  const saved = Promise.withResolvers<void>();
  const optional = { active: true };
  const telemetry = createOptionalTelemetry({
    adapters: [
      async () => ({
        start: () => {},
        stop: async () => {
          await cleanup.promise;
          optional.active = false;
        },
        clear: () => {},
      }),
    ],
  });
  await telemetry.start(all);
  const persisted = { preference: all };
  const browser = createPrivacyBrowser({
    initial: all,
    preferences: {
      read: async () => persisted.preference,
      save: async (input) => {
        persisted.preference = { ...all, choice: input.choice, revision: 2 };
        saved.resolve();
        return persisted.preference;
      },
    },
    telemetry,
    synchronization: {
      exclusive: async (execute) => execute(),
      publish: () => {},
      subscribe: () => () => {},
    },
  });
  const revoke = browser.change("necessary");
  await saved.promise;
  expect(persisted.preference.choice).toBe("necessary");
  expect(optional.active).toBe(true);
  expect(get(browser.view).status).toBe("saving");
  cleanup.resolve();
  await revoke;
  expect(optional.active).toBe(false);
  expect(get(browser.view).status).toBe("ready");
}, 1000);

test("late refresh failure preserves newer confirmed consent", async () => {
  const oldStart = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const settled = Promise.withResolvers<void>();
  const active = { newAdapter: false };
  const browser = createPrivacyBrowser({
    initial: all,
    preferences: {
      read: async () => all,
      save: async () => ({ ...all, revision: 2 }),
    },
    telemetry: {
      start: async (preference) => {
        if (preference.revision === 1) {
          entered.resolve();
          try {
            await oldStart.promise;
          } finally {
            settled.resolve();
          }
        } else active.newAdapter = true;
      },
      stop: async () => {
        active.newAdapter = false;
      },
    },
    synchronization: {
      exclusive: async (execute) => execute(),
      publish: () => {},
      subscribe: () => () => {},
    },
  });
  const dispose = browser.mount();
  await entered.promise;
  await browser.change("all");
  oldStart.reject(new Error("old start failed"));
  await settled.promise;
  // Let the mounted refresh's rejection handler settle before observing the view.
  await Promise.resolve();
  await Promise.resolve();
  const view = get(browser.view);
  expect(view.preference).toMatchObject({ choice: "all", revision: 2 });
  expect(view.status).toBe("ready");
  expect(active.newAdapter).toBe(true);
  dispose();
});

test("unmount remount fences old stop rejection and old subscription", async () => {
  const released = Promise.withResolvers<void>();
  const callbacks: (() => void)[] = [];
  const state = { stops: 0, active: false };
  const browser = createPrivacyBrowser({
    initial: all,
    preferences: {
      read: async () => ({ ...all, revision: 2 }),
      save: async () => all,
    },
    telemetry: {
      start: async () => {
        state.active = true;
      },
      stop: async () => {
        state.stops += 1;
        if (state.stops === 3) return released.promise;
        state.active = false;
      },
    },
    synchronization: {
      exclusive: async (execute) => execute(),
      publish: () => {},
      subscribe: (callback) => {
        callbacks.push(callback);
        return () => {};
      },
    },
  });
  const disposeOld = browser.mount();
  await browser.refresh();
  disposeOld();
  const disposeNew = browser.mount();
  await browser.refresh();
  const stops = state.stops;
  callbacks[0]?.();
  disposeOld();
  expect(state.stops).toBe(stops);
  released.reject(new Error("old release failed"));
  await Promise.resolve();
  await Promise.resolve();
  expect(get(browser.view).preference).toMatchObject({
    choice: "all",
    revision: 2,
  });
  expect(get(browser.view).status).toBe("ready");
  expect(state.active).toBe(true);
  disposeNew();
});

test("current start failure denies locally and releases acquired optional resources", async () => {
  const entered = Promise.withResolvers<void>();
  const failStart = Promise.withResolvers<void>();
  const state = { active: false, cleared: false };
  const telemetry = createOptionalTelemetry({
    adapters: [
      async () => ({
        start: async () => {
          state.active = true;
          entered.resolve();
          await failStart.promise;
        },
        stop: () => {
          state.active = false;
        },
        clear: () => {
          state.cleared = true;
        },
      }),
    ],
  });
  const browser = createPrivacyBrowser({
    initial: all,
    preferences: {
      read: async () => all,
      save: async () => ({ ...all, revision: 2 }),
    },
    telemetry,
    synchronization: {
      exclusive: async (execute) => execute(),
      publish: () => {},
      subscribe: () => () => {},
    },
  });
  const dispose = browser.mount();
  const refresh = browser.refresh();
  await entered.promise;
  failStart.reject(new Error("current start failed"));
  await refresh;
  expect(get(browser.view).preference.choice).toBe("necessary");
  expect(get(browser.view).status).toBe("error");
  expect(state.active).toBe(false);
  expect(state.cleared).toBe(true);
  await browser.refresh();
  expect(get(browser.view).preference.choice).toBe("necessary");
  expect(state.active).toBe(false);
  dispose();
});
