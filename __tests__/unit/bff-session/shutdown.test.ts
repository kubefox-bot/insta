import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { startRevocationWorker } from "../../../apps/fe-insta/src/lib/session/server/adapters/worker";

test("revocation shutdown drains the current unknown effect but keeps the next binding and stable key for restart", async () => {
  const started = Promise.withResolvers<void>();
  const cleanup = Promise.withResolvers<void>();
  const pending = ["first", "second"].map((id) => ({
    bindingId: id,
    user: { id, username: id },
    backendSessionId: id,
    credentials: "cipher",
    revokeSecret: "cipher",
    accessExpiresAt: 100,
    expiresAt: 200,
    absoluteExpiresAt: 1000,
    revision: 0,
    blocked: true,
    revocation: { key: `stable-${id}`, failures: 0, nextAttemptAt: 0 },
  }));
  const keys: string[] = [];
  const updates: string[] = [];
  let returned = false;
  const stop = startRevocationWorker({
    dependencies: {
      clock: () => 1,
      store: {
        pendingRevocations: async () => pending,
        finishRevocation: async ({ key, confirmed }) => {
          expect(confirmed).toBe(false);
          updates.push(key);
        },
      },
      crypto: { openRevokeSecret: async () => "synthetic" },
      backend: {
        revoke: async ({ key }) => {
          keys.push(key);
          started.resolve();
          await cleanup.promise;
          return Result.Error({ code: "UNKNOWN" });
        },
      },
    },
    onError: () => {
      throw new Error("Unexpected failure");
    },
  });
  await started.promise;
  const closing = stop().then(() => {
    returned = true;
  });
  await Promise.resolve();
  expect(returned).toBe(false);
  cleanup.resolve();
  await closing;
  expect(keys).toEqual(["stable-first"]);
  expect(updates).toEqual(["stable-first"]);
  expect(pending[1]?.revocation.key).toBe("stable-second");
});
