import { expect, test } from "bun:test";
import { createStoryJobs } from "../../../apps/be-insta/src/domains/stories/adapters/jobs/create";
import { createStoryMaintenance } from "../../../apps/be-insta/src/domains/stories/use-cases/maintenance";

const fixture = () => ({
  profiles: [
    { id: "old", prefix: "old/" },
    { id: "new", prefix: "new/" },
  ],
  clock: () => 100,
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
    read: async () => ({ kind: "missing" as const }),
  },
  storage: {
    list: async () => ({ objects: [] }),
    delete: async () => {},
    read: async () => ({ kind: "missing" as const }),
    putUnique: async () => {
      throw new Error("Unexpected PUT");
    },
    signPlayback: () => {
      throw new Error("Unexpected playback");
    },
  },
});
test("partial cleanup retains failed key for retry and degrades the settled job", async () => {
  const acknowledged: string[] = [];
  const retried: string[] = [];
  const attempts = Promise.withResolvers<void>();
  const accounts = [
    { id: "failed", token: "first", profile: "old", key: "old/failed" },
    { id: "ok", token: "second", profile: "old", key: "old/ok" },
  ];
  const dependencies = fixture();
  const maintenance = createStoryMaintenance({
    ...dependencies,
    cleanup: {
      claim: async () => accounts,
      acknowledge: async (account) => {
        acknowledged.push(account.key);
      },
      retry: async (account) => {
        retried.push(account.key);
      },
    },
    storage: {
      ...dependencies.storage,
      delete: async ({ key }) => {
        if (key === "old/failed") throw new Error("Unknown DELETE effect");
      },
    },
  });
  const jobs = createStoryJobs({
    ...maintenance,
    cleanup: (signal) =>
      maintenance.cleanup(signal).finally(() => attempts.resolve()),
  });
  jobs.start();
  await attempts.promise;
  await jobs.close();
  expect(acknowledged).toEqual(["old/ok"]);
  expect(retried).toEqual(["old/failed"]);
  expect(jobs.status()).toBe("degraded");
});
test("failed first profile retains its cursor while a healthy next profile progresses under total concurrency four", async () => {
  const visited: string[] = [];
  const advanced: string[] = [];
  const deleted: string[] = [];
  let active = 0;
  let maximum = 0;
  const dependencies = fixture();
  const maintenance = createStoryMaintenance({
    ...dependencies,
    ownership: {
      cursor: async () => "retained-cursor",
      advance: async ({ profile }) => {
        advanced.push(profile);
      },
      read: async () => {
        active++;
        maximum = Math.max(maximum, active);
        await Promise.resolve();
        active--;
        return { kind: "missing" };
      },
    },
    storage: {
      ...dependencies.storage,
      list: async ({ profile, prefix }) => {
        visited.push(profile);
        if (profile === "old") throw new Error("Old provider unavailable");
        return {
          objects: Array.from({ length: 9 }, (_, index) => ({
            profile,
            key: `${prefix}${index}`,
            byteLength: 1,
          })),
        };
      },
      delete: async ({ key }) => {
        deleted.push(key);
      },
    },
  });
  await expect(
    maintenance.reconcile(new AbortController().signal),
  ).rejects.toThrow();
  expect(visited).toEqual(["old", "new"]);
  expect(advanced).toEqual(["new"]);
  expect(deleted).toHaveLength(9);
  expect(maximum).toBe(4);
});
