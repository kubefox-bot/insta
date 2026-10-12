import { expect, test } from "bun:test";
import { formatDateTime } from "@insta/fe-core/dates";
import { completeRegistration } from "../../../apps/be-insta/src/domains/users/auth/use-cases/complete-registration";
import { deliverCode } from "../../../apps/be-insta/src/domains/users/auth/use-cases/deliver-code";
import { requestCode } from "../../../apps/be-insta/src/domains/users/auth/use-cases/request-code";
import { verifyCode } from "../../../apps/be-insta/src/domains/users/auth/use-cases/verify-code";
import { createRegistrationEnvironment } from "../../fixtures/registration/environment";

test("atomic stream contains no email/code; SMTP acceptance is observed in real Mailpit and payload removed", async () => {
  const f = await createRegistrationEnvironment();
  try {
    const issued = await f.issue();
    const stream = JSON.stringify(
      await f.broker.send("XRANGE", [
        `auth:${f.generation}:${f.namespace}:mail`,
        "-",
        "+",
      ]),
    );
    expect(stream.includes(issued.email)).toBe(false);
    expect(stream.includes(issued.code)).toBe(false);
    expect(
      await deliverCode({
        jobs: f.jobs,
        crypto: f.dependencies.crypto,
        sender: f.sender,
        clock: f.clock,
      }),
    ).toBe("accepted");
    const mail = await f.mail(issued.email);
    expect(mail).toHaveLength(1);
    expect(mail[0]?.Text.includes(issued.code)).toBe(true);
    const deadline = formatDateTime({
      timestampMs: issued.request.registrationExpiresAt,
      locale: "ru",
      timeZone: "UTC",
      options: { dateStyle: "medium", timeStyle: "long" },
    });
    if (deadline === null) throw new Error("Invalid fixture deadline");
    expect(mail[0]?.Text).toContain(deadline);
    expect(
      await f.broker.get(
        `auth:${f.generation}:${f.namespace}:payload:${issued.challenge.version}`,
      ),
    ).toBeNull();
    expect(
      Number(
        await f.broker.send("XLEN", [
          `auth:${f.generation}:${f.namespace}:mail`,
        ]),
      ),
    ).toBe(0);
  } finally {
    await f.dispose();
  }
});
test("resend preserves deadline/error budget, invalidates old code and skips replaced delivery", async () => {
  const f = await createRegistrationEnvironment();
  try {
    const first = await f.issue();
    const wrong = first.code === "000000" ? "000001" : "000000";
    expect(
      (
        await verifyCode(
          { challengeId: first.challenge.challengeId, code: wrong },
          f.dependencies,
        )
      ).isError(),
    ).toBe(true);
    f.advance(60000);
    const resent = await requestCode(
      { email: first.email, operationId: f.operation() },
      f.dependencies,
    );
    if (resent.isError()) throw new Error(resent.getError());
    expect(resent.get().registrationExpiresAt).toBe(
      first.request.registrationExpiresAt,
    );
    expect(
      (await f.dependencies.challenges.read(first.challenge.challengeId))
        ?.errors,
    ).toBe(1);
    expect(
      await deliverCode({
        jobs: f.jobs,
        crypto: f.dependencies.crypto,
        sender: f.sender,
        clock: f.clock,
      }),
    ).toBe("stale");
    expect((await f.mail(first.email)).length).toBe(0);
    expect(
      (
        await verifyCode(
          { challengeId: first.challenge.challengeId, code: first.code },
          f.dependencies,
        )
      ).isError(),
    ).toBe(true);
  } finally {
    await f.dispose();
  }
});
test("fifth wrong code exhausts lifetime budget; resend and sixth correct code are rejected", async () => {
  const f = await createRegistrationEnvironment();
  try {
    const issued = await f.issue();
    const wrong = issued.code === "000000" ? "000001" : "000000";
    for (let attempt = 0; attempt < 5; attempt++)
      expect(
        (
          await verifyCode(
            { challengeId: issued.challenge.challengeId, code: wrong },
            f.dependencies,
          )
        ).isError(),
      ).toBe(true);
    expect(
      (
        await verifyCode(
          { challengeId: issued.challenge.challengeId, code: issued.code },
          f.dependencies,
        )
      ).toJSON(),
    ).toMatchObject({ tag: "Error", error: "CODE_EXHAUSTED" });
    f.advance(60000);
    expect(
      (
        await requestCode(
          { email: issued.email, operationId: f.operation() },
          f.dependencies,
        )
      ).toJSON(),
    ).toMatchObject({ tag: "Error", error: "CODE_EXHAUSTED" });
  } finally {
    await f.dispose();
  }
});
test("concurrent complete returns one canonical user/session/event and mismatch cannot reset password", async () => {
  const f = await createRegistrationEnvironment();
  try {
    const pending = await f.pending();
    const input = {
      proof: pending.registrationProof,
      username: `U${crypto.randomUUID().replaceAll("-", "").slice(0, 25)}`,
      password: "synthetic-password-123",
      idempotencyKey: crypto.randomUUID(),
      operationId: f.operation(),
    };
    const [first, second] = await Promise.all([
      completeRegistration(input, f.dependencies),
      completeRegistration(
        { ...input, operationId: f.operation() },
        f.dependencies,
      ),
    ]);
    expect(first.isOk()).toBe(true);
    expect(second).toEqual(first);
    expect(
      await f.db
        .collection("users")
        .countDocuments({ emailKey: pending.email, status: "active" }),
    ).toBe(1);
    const account = await f.db
      .collection("users")
      .findOne({ emailKey: pending.email });
    expect(
      await f.db
        .collection("users_sessions")
        .countDocuments({ userId: account?._id }),
    ).toBe(1);
    expect(
      await f.db.collection("users_outbox").countDocuments({
        userId: account?._id,
        type: "registration_completed",
      }),
    ).toBe(1);
    expect(
      (
        await completeRegistration(
          { ...input, password: "different-password-123" },
          f.dependencies,
        )
      ).toJSON(),
    ).toMatchObject({ tag: "Error", error: "REGISTRATION_CONFLICT" });
    expect(
      (await f.db.collection("users").findOne({ _id: account?._id }))
        ?.passwordHash,
    ).toBe(account?.passwordHash);
  } finally {
    await f.dispose();
  }
});
test("reconfirmation replaces Mongo proof without extending first deadline; active email only reveals login after correct proof", async () => {
  const f = await createRegistrationEnvironment();
  try {
    const first = await f.pending();
    f.advance(60000);
    await requestCode(
      { email: first.email, operationId: f.operation() },
      f.dependencies,
    );
    const challenge = await f.dependencies.challenges.read(
      first.challenge.challengeId,
    );
    if (!challenge) throw new Error("missing");
    const encrypted = await f.broker.get(
      `auth:${f.generation}:${f.namespace}:payload:${challenge.version}`,
    );
    if (!encrypted) throw new Error("missing");
    const { code } = await f.dependencies.crypto.openMail(encrypted);
    const verified = await verifyCode(
      { challengeId: challenge.challengeId, code },
      f.dependencies,
    );
    if (verified.isError()) throw new Error(verified.getError());
    const value = verified.get();
    if (value.status !== "pending_setup") throw new Error("expected pending");
    expect(value.expiresAt).toBe(first.expiresAt);
    expect(value.registrationProof).not.toBe(first.registrationProof);
    const input = {
      username: `U${crypto.randomUUID().replaceAll("-", "").slice(0, 25)}`,
      password: "synthetic-password-123",
      operationId: f.operation(),
    };
    expect(
      (
        await completeRegistration(
          { ...input, proof: first.registrationProof },
          f.dependencies,
        )
      ).isError(),
    ).toBe(true);
    expect(
      (
        await completeRegistration(
          { ...input, proof: value.registrationProof },
          f.dependencies,
        )
      ).isOk(),
    ).toBe(true);
    f.advance(60000);
    expect(
      (
        await requestCode(
          { email: first.email, operationId: f.operation() },
          f.dependencies,
        )
      ).isOk(),
    ).toBe(true);
    const activeChallenge = await f.dependencies.challenges.read(
      first.challenge.challengeId,
    );
    if (!activeChallenge) throw new Error("missing");
    const payload = await f.broker.get(
      `auth:${f.generation}:${f.namespace}:payload:${activeChallenge.version}`,
    );
    if (!payload) throw new Error("missing");
    const activeCode = (await f.dependencies.crypto.openMail(payload)).code;
    const activeResult = await verifyCode(
      { challengeId: activeChallenge.challengeId, code: activeCode },
      f.dependencies,
    );
    if (activeResult.isError()) throw new Error(activeResult.getError());
    expect(activeResult.get()).toEqual({ status: "login_required" });
  } finally {
    await f.dispose();
  }
});

test("pending cleanup racing valid completion leaves one active account and consumed canonical proof", async () => {
  const f = await createRegistrationEnvironment();
  try {
    const pending = await f.pending();
    const proof = await f.dependencies.crypto.verifyProof({
      proof: pending.registrationProof,
      now: f.clock(),
    });
    if (proof.isError()) throw new Error(proof.getError());
    const [cleanup, completion] = await Promise.all([
      f.dependencies.registration.cleanup({
        userId: proof.get().userId,
        now: f.clock(),
      }),
      completeRegistration(
        {
          proof: pending.registrationProof,
          username: `U${crypto.randomUUID().replaceAll("-", "").slice(0, 25)}`,
          password: "synthetic-password-123",
          operationId: f.operation(),
        },
        f.dependencies,
      ),
    ]);
    expect(cleanup).toBe(0);
    expect(completion.isOk()).toBe(true);
    expect(
      await f.db
        .collection("users")
        .countDocuments({ emailKey: pending.email, status: "active" }),
    ).toBe(1);
  } finally {
    await f.dispose();
  }
});

test("lost ephemeral challenge cannot extend the canonical pending setup deadline", async () => {
  const f = await createRegistrationEnvironment();
  try {
    const pending = await f.pending();
    await f.broker.del(
      `auth:${f.generation}:${f.namespace}:challenge:${pending.challenge.challengeId}`,
    );
    f.advance(60000);
    const requested = await requestCode(
      { email: pending.email, operationId: f.operation() },
      f.dependencies,
    );
    if (requested.isError()) throw new Error(requested.getError());
    expect(requested.get().registrationExpiresAt).toBe(pending.expiresAt);
  } finally {
    await f.dispose();
  }
});
