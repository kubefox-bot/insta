import { expect, test } from "bun:test";
import { createStoryJobs } from "../../../apps/be-insta/src/domains/stories/adapters/jobs/create";

test("jobs stop claims but close waits for actual provider settlement beyond watchdog", async () => {
  const entered = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  const timers = new Map<() => void, number>();
  let runs = 0;
  let settled = false;
  const jobs = createStoryJobs({
    cleanup: async (signal) => {
      runs++;
      entered.resolve();
      await released.promise;
      expect(signal.aborted).toBe(true);
    },
    reconcile: async () => {},
    invalidate: async () => {},
    timers: {
      every: (callback, ms) => {
        timers.set(callback, ms);
        return () => {
          timers.delete(callback);
        };
      },
      after: (callback, ms) => {
        timers.set(callback, ms);
        return () => {
          timers.delete(callback);
        };
      },
    },
  });
  jobs.start();
  await entered.promise;
  const closing = jobs.close().then(() => {
    settled = true;
  });
  const watchdog = [...timers].find(([, ms]) => ms === 15000)?.[0];
  expect(watchdog).toBeDefined();
  watchdog?.();
  await Promise.resolve();
  expect(settled).toBe(false);
  expect(jobs.status()).toBe("degraded");
  jobs.start();
  expect(runs).toBe(1);
  released.resolve();
  await closing;
  expect(settled).toBe(true);
});

test("retained profiles share one reconciler concurrency budget", async () => {
  const { createStoryMaintenance } = await import(
    "../../../apps/be-insta/src/domains/stories/use-cases/maintenance"
  );
  let active = 0;
  let maximum = 0;
  const profiles: string[] = [];
  const maintenance = createStoryMaintenance({
    profiles: [
      { id: "old", prefix: "old/" },
      { id: "new", prefix: "new/" },
    ],
    clock: () => 1,
    invalidate: async () => {},
    cleanup: {
      claim: async () => [],
      acknowledge: async () => {},
      retry: async () => {},
    },
    outbox: { pending: async () => [], acknowledge: async () => {} },
    ownership: {
      cursor: async () => null,
      advance: async () => {},
      read: async () => {
        active++;
        maximum = Math.max(maximum, active);
        await Promise.resolve();
        active--;
        return { kind: "found" };
      },
    },
    storage: {
      list: async ({ profile, prefix }) => {
        profiles.push(profile);
        expect(active).toBe(0);
        return {
          objects: Array.from({ length: 9 }, (_, i) => ({
            profile,
            key: `${prefix}${i}`,
            byteLength: 1,
          })),
        };
      },
      delete: async () => {
        throw new Error("Owned object deletion");
      },
      read: async () => ({ kind: "missing" }),
      putUnique: async () => {
        throw new Error("Unexpected PUT");
      },
      signPlayback: () => {
        throw new Error("Unexpected sign");
      },
    },
  });
  await maintenance.reconcile(new AbortController().signal);
  expect(maximum).toBe(4);
  expect(profiles).toEqual(["old", "new"]);
});
