import { expect, test } from "bun:test";
import { cleanupExpired } from "../../../apps/be-insta/src/domains/stories/use-cases/cleanup";
import { reconcileObjects } from "../../../apps/be-insta/src/domains/stories/use-cases/reconcile";

test("cleanup retains ownership after an unacknowledged delete and acknowledges only a successful retry", async () => {
  const order: string[] = [];
  let fail = true;
  const account = {
    id: "upload",
    token: "claim",
    profile: "old",
    key: "stories/key",
  };
  const cleanup = {
    claim: async () => [account],
    acknowledge: async () => {
      order.push("ack");
    },
    retry: async () => {
      order.push("retry");
    },
  };
  const storage = {
    delete: async (input: Readonly<{ profile: string; key: string }>) => {
      expect(input.profile).toBe("old");
      order.push("delete");
      if (fail) throw new Error("unknown");
    },
  };
  await cleanupExpired({ now: 1 }, { cleanup, storage });
  expect(order).toEqual(["delete", "retry"]);
  fail = false;
  await cleanupExpired({ now: 2 }, { cleanup, storage });
  expect(order).toEqual(["delete", "retry", "delete", "ack"]);
});
test("reconciler never deletes after failed ownership reads and revisits late PUT on next complete pass", async () => {
  const deletes: string[] = [];
  let failed = true;
  let objects = [{ profile: "old", key: "stories/orphan", byteLength: 1 }];
  const cursors: (string | null)[] = [];
  const storage = {
    list: async () => ({ objects }),
    delete: async ({ key }: Readonly<{ key: string }>) => {
      deletes.push(key);
      objects = [];
    },
  };
  const ownership = {
    read: async () =>
      failed ? { kind: "error" as const } : { kind: "missing" as const },
    cursor: async () => null,
    advance: async (input: Readonly<{ cursor: string | null }>) => {
      cursors.push(input.cursor);
    },
  };
  const input = { profile: "old", prefix: "stories/" };
  await expect(
    reconcileObjects(input, { storage, ownership }),
  ).rejects.toThrow();
  expect(deletes).toEqual([]);
  expect(cursors).toEqual([]);
  failed = false;
  await reconcileObjects(input, { storage, ownership });
  expect(deletes).toEqual(["stories/orphan"]);
  objects = [{ profile: "old", key: "stories/orphan", byteLength: 1 }];
  await reconcileObjects(input, { storage, ownership });
  expect(deletes).toEqual(["stories/orphan", "stories/orphan"]);
  expect(cursors).toEqual([null, null]);
});
