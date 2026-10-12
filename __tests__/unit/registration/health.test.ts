import { expect, test } from "bun:test";
import { createRegistrationCrypto } from "../../../apps/be-insta/src/domains/users/auth/adapters/registration/jose/crypto";
import { startRegistrationWorker } from "../../../apps/be-insta/src/domains/users/auth/adapters/registration/worker";
import type { EmailJob } from "../../../apps/be-insta/src/domains/users/auth/ports/registration/email-jobs";

const fixture = async () => {
  const gates = Array.from({ length: 6 }, () => ({
    entered: Promise.withResolvers<void>(),
    result: Promise.withResolvers<EmailJob | null>(),
  }));
  const crypto = createRegistrationCrypto("ab".repeat(32));
  const ciphertext = await crypto.sealMail({
    email: "synthetic@example.test",
    code: "123456",
  });
  const state = { now: 0, smtpFails: false, cleanupFails: false, stale: false };
  let reads = 0;
  const worker = startRegistrationWorker({
    jobs: {
      next: () => {
        const gate = gates[reads++];
        if (!gate) throw new Error("Unexpected poll");
        gate.entered.resolve();
        return gate.result.promise;
      },
      prepare: async () =>
        state.stale
          ? null
          : { state: "ready", ciphertext, expiresAt: 86400000, errors: 0 },
      finish: async () => {},
      retry: async () => {},
    },
    crypto,
    sender: {
      send: async () => {
        if (state.smtpFails) throw new Error("SMTP unavailable");
        return "accepted";
      },
    },
    registration: {
      deadline: async () => null,
      expired: async () => {
        if (state.cleanupFails) throw new Error("Mongo unavailable");
        return [];
      },
      cleanup: async () => 0,
      confirmEmail: async () => {
        throw new Error("unused");
      },
    },
    clock: () => state.now,
  });
  const job = {
    id: "1-0",
    challengeId: "a".repeat(64),
    version: "v1",
    generation: "g1",
  };
  const step = async (index: number, value: EmailJob | null) => {
    const current = gates[index];
    const next = gates[index + 1];
    if (!current || !next) throw new Error("Invalid barrier");
    const timeout = Promise.withResolvers<never>();
    const timer = setTimeout(
      () => timeout.reject(new Error("Worker barrier timed out")),
      2000,
    );
    try {
      await Promise.race([current.entered.promise, timeout.promise]);
      current.result.resolve(value);
      await Promise.race([next.entered.promise, timeout.promise]);
    } finally {
      clearTimeout(timer);
    }
  };
  return {
    state,
    worker,
    job,
    step,
    close: async () => {
      const closing = worker.close();
      for (const gate of gates) gate.result.resolve(null);
      await closing;
    },
  };
};
test("idle and stale work retain failed delivery health until SMTP acceptance", async () => {
  const f = await fixture();
  try {
    f.state.smtpFails = true;
    await f.step(0, f.job);
    expect(f.worker.status()).toBe("degraded");
    await f.step(1, null);
    expect(f.worker.status()).toBe("degraded");
    f.state.stale = true;
    await f.step(2, f.job);
    expect(f.worker.status()).toBe("degraded");
    f.state.stale = false;
    f.state.smtpFails = false;
    await f.step(3, f.job);
    expect(f.worker.status()).toBe("ok");
  } finally {
    await f.close();
  }
});
test("idle and SMTP acceptance cannot clear failed cleanup; successful sweep can", async () => {
  const f = await fixture();
  try {
    f.state.cleanupFails = true;
    await f.step(0, null);
    expect(f.worker.status()).toBe("degraded");
    await f.step(1, null);
    expect(f.worker.status()).toBe("degraded");
    await f.step(2, f.job);
    expect(f.worker.status()).toBe("degraded");
    f.state.cleanupFails = false;
    f.state.now = 60000;
    await f.step(3, null);
    expect(f.worker.status()).toBe("ok");
  } finally {
    await f.close();
  }
});
