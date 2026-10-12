import { expect, test } from "bun:test";
import { createRegistrationCrypto } from "../../../apps/be-insta/src/domains/users/auth/adapters/registration/jose/crypto";
import { startRegistrationWorker } from "../../../apps/be-insta/src/domains/users/auth/adapters/registration/worker";

test("worker shutdown drains its in-flight operation and schedules no poll after cancellation", async () => {
  const barrier = Promise.withResolvers<null>();
  let reads = 0;
  const worker = startRegistrationWorker({
    jobs: {
      next: () => {
        reads++;
        return barrier.promise;
      },
      prepare: async () => null,
      finish: async () => {},
      retry: async () => {},
    },
    crypto: createRegistrationCrypto("aa".repeat(32)),
    sender: { send: async () => "accepted" },
    registration: {
      deadline: async () => null,
      expired: async () => [],
      cleanup: async () => 0,
      confirmEmail: async () => {
        throw new Error("unused");
      },
    },
    clock: Date.now,
  });
  expect(reads).toBe(1);
  let closed = false;
  const closing = worker.close().then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  barrier.resolve(null);
  await closing;
  expect(closed).toBe(true);
  expect(reads).toBe(1);
});
