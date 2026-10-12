import { expect, test } from "bun:test";
import { createPasswordAdmission } from "../../../apps/be-insta/src/domains/users/adapters/passwords/admission";
import { PasswordAdmissionError } from "../../../apps/be-insta/src/domains/users/index";

test("admission has two active, eight waiting, rejects overflow before work and releases capacity", async () => {
  const admission = createPasswordAdmission({
    concurrent: 2,
    queued: 8,
    queueTimeoutMs: 2000,
  });
  const releaseA = await admission.acquire();
  const releaseB = await admission.acquire();
  const waiting = Array.from({ length: 8 }, () => admission.acquire());
  await expect(admission.acquire()).rejects.toBeInstanceOf(
    PasswordAdmissionError,
  );
  releaseA();
  const releaseNext = await waiting[0];
  if (!releaseNext) throw new Error("Missing permit");
  releaseNext();
  releaseB();
  for (const waiter of waiting.slice(1)) (await waiter)();
  (await admission.acquire())();
});
test("timed out waiter never starts and release is idempotent", async () => {
  const admission = createPasswordAdmission({
    concurrent: 1,
    queued: 1,
    queueTimeoutMs: 20,
  });
  const release = await admission.acquire();
  await expect(admission.acquire()).rejects.toMatchObject({
    code: "AUTH_BUSY",
    retryAfterSeconds: 2,
  });
  release();
  release();
  const next = await admission.acquire();
  const queued = admission.acquire();
  await expect(admission.acquire()).rejects.toBeInstanceOf(
    PasswordAdmissionError,
  );
  next();
  (await queued)();
});
