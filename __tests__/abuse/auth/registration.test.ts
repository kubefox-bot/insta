import { expect, test } from "bun:test";
import { loseFirstCommitReply } from "../../../apps/be-insta/__tests__/integration/users/commit-loss";
import { createMongoAuthPersistence } from "../../../apps/be-insta/src/domains/users/adapters/mongo/auth-persistence";
import { createMongoRegistrationPersistence } from "../../../apps/be-insta/src/domains/users/adapters/mongo/registration-persistence";
import { createDragonflyEmailJobs } from "../../../apps/be-insta/src/domains/users/auth/adapters/registration/dragonfly/jobs";
import { completeRegistration } from "../../../apps/be-insta/src/domains/users/auth/use-cases/complete-registration";
import { deliverCode } from "../../../apps/be-insta/src/domains/users/auth/use-cases/deliver-code";
import { requestCode } from "../../../apps/be-insta/src/domains/users/auth/use-cases/request-code";
import { verifyCode } from "../../../apps/be-insta/src/domains/users/auth/use-cases/verify-code";
import { createRegistrationEnvironment } from "../../fixtures/registration/environment";

test("unknown OTP to Mongo outcome consumes code and demands reconfirmation, never guesses success", async () => {
  const f = await createRegistrationEnvironment();
  try {
    const issued = await f.issue();
    const registration = {
      ...f.dependencies.registration,
      confirmEmail: async (
        input: Parameters<typeof f.dependencies.registration.confirmEmail>[0],
      ) => {
        await f.dependencies.registration.confirmEmail(input);
        throw new Error("synthetic lost persisted reply");
      },
    };
    expect(
      (
        await verifyCode(
          { challengeId: issued.challenge.challengeId, code: issued.code },
          { ...f.dependencies, registration },
        )
      ).toJSON(),
    ).toMatchObject({ tag: "Error", error: "RECONFIRM_EMAIL" });
    expect(
      await f.db
        .collection("users")
        .countDocuments({ emailKey: issued.email, status: "pending_setup" }),
    ).toBe(1);
    expect(
      (
        await verifyCode(
          { challengeId: issued.challenge.challengeId, code: issued.code },
          f.dependencies,
        )
      ).isError(),
    ).toBe(true);
    f.advance(60000);
    expect(
      (
        await requestCode(
          { email: issued.email, operationId: f.operation() },
          f.dependencies,
        )
      ).isOk(),
    ).toBe(true);
    const challenge = await f.dependencies.challenges.read(
      issued.challenge.challengeId,
    );
    if (!challenge) throw new Error("missing");
    const payload = await f.broker.get(
      `auth:${f.generation}:${f.namespace}:payload:${challenge.version}`,
    );
    if (!payload) throw new Error("missing");
    const code = (await f.dependencies.crypto.openMail(payload)).code;
    const reconfirmed = await verifyCode(
      { challengeId: challenge.challengeId, code },
      f.dependencies,
    );
    if (reconfirmed.isError()) throw new Error(reconfirmed.getError());
    expect(reconfirmed.get().status).toBe("pending_setup");
    expect(
      await f.db.collection("users").countDocuments({ emailKey: issued.email }),
    ).toBe(1);
  } finally {
    await f.dispose();
  }
});
test("actual unknown activation commit result recovers one canonical receipt with encrypted credentials", async () => {
  const f = await createRegistrationEnvironment();
  try {
    const pending = await f.pending();
    const loss = loseFirstCommitReply(f.database);
    const input = {
      proof: pending.registrationProof,
      username: `U${crypto.randomUUID().replaceAll("-", "").slice(0, 25)}`,
      password: "synthetic-password-123",
      idempotencyKey: crypto.randomUUID(),
      operationId: f.operation(),
    };
    const first = await completeRegistration(input, {
      ...f.dependencies,
      persistence: createMongoAuthPersistence({
        ...loss.connection,
        clock: f.clock,
      }),
    });
    const retry = await completeRegistration(
      { ...input, operationId: f.operation() },
      f.dependencies,
    );
    if (first.isError()) throw new Error(first.getError());
    expect(first.isOk()).toBe(true);
    expect(retry).toEqual(first);
    expect(loss.observed()).toEqual({ lostReply: true, committedCalls: 2 });
    const user = await f.db
      .collection("users")
      .findOne({ emailKey: pending.email });
    expect(
      await f.db
        .collection("users_sessions")
        .countDocuments({ userId: user?._id }),
    ).toBe(1);
    expect(
      await f.db
        .collection("users_outbox")
        .countDocuments({ userId: user?._id, type: "registration_completed" }),
    ).toBe(1);
    const replay = await f.db
      .collection("users_auth_replays")
      .findOne({ owner: user?._id });
    expect(JSON.stringify(replay).includes(input.password)).toBe(false);
    expect(
      JSON.stringify(replay).includes(first.get().credentials.refreshToken),
    ).toBe(false);
  } finally {
    await f.dispose();
  }
});
test("SMTP accepted then crash before XACK is reclaimed by another consumer and may send duplicate", async () => {
  const f = await createRegistrationEnvironment();
  try {
    const issued = await f.issue();
    const crash = {
      ...f.jobs,
      finish: async () => {
        throw new Error("synthetic after SMTP acceptance");
      },
    };
    await expect(
      deliverCode({
        jobs: crash,
        crypto: f.dependencies.crypto,
        sender: f.sender,
        clock: f.clock,
      }),
    ).rejects.toThrow("synthetic");
    expect(await f.mail(issued.email)).toHaveLength(1);
    const stream = `auth:${f.generation}:${f.namespace}:mail`;
    const pending = await f.broker.send("XPENDING", [
      stream,
      "registration-mail-v1",
      "-",
      "+",
      "10",
    ]);
    const { z } = await import("zod");
    const entries = z
      .array(z.tuple([z.string(), z.string(), z.number(), z.number()]))
      .parse(pending);
    const entry = entries[0];
    if (!entry) throw new Error("pending missing");
    await f.broker.send("XCLAIM", [
      stream,
      "registration-mail-v1",
      entry[1],
      "0",
      entry[0],
      "IDLE",
      "31000",
    ]);
    const jobs = createDragonflyEmailJobs({
      client: f.broker,
      namespace: f.namespace,
      consumer: crypto.randomUUID(),
      clock: f.clock,
    });
    expect(
      await deliverCode({
        jobs,
        crypto: f.dependencies.crypto,
        sender: f.sender,
        clock: f.clock,
      }),
    ).toBe("accepted");
    expect(await f.mail(issued.email)).toHaveLength(2);
    expect(Number(await f.broker.send("XLEN", [stream]))).toBe(0);
  } finally {
    await f.dispose();
  }
});
test("absolute expiry blocks activation and conditional cleanup cannot delete active account", async () => {
  const f = await createRegistrationEnvironment();
  try {
    const active = await f.complete();
    if (active.result.isError()) throw new Error(active.result.getError());
    const pending = await f.pending();
    const proof = await f.dependencies.crypto.verifyProof({
      proof: pending.registrationProof,
      now: f.clock(),
    });
    if (proof.isError()) throw new Error(proof.getError());
    f.advance(86400000);
    expect(
      (
        await completeRegistration(
          {
            proof: pending.registrationProof,
            username: "expired_user",
            password: "synthetic-password-123",
            operationId: f.operation(),
          },
          f.dependencies,
        )
      ).isError(),
    ).toBe(true);
    const persistence = createMongoRegistrationPersistence({
      ...f.database,
      clock: f.clock,
    });
    expect(
      await persistence.cleanup({ userId: proof.get().userId, now: f.clock() }),
    ).toBe(1);
    const activeProof = await f.dependencies.crypto.verifyProof({
      proof: active.value.registrationProof,
      now: f.clock() - 86400000,
    });
    if (activeProof.isError()) throw new Error(activeProof.getError());
    expect(
      await persistence.cleanup({
        userId: activeProof.get().userId,
        now: f.clock(),
      }),
    ).toBe(0);
    expect(
      await f.db
        .collection("users")
        .countDocuments({ emailKey: active.value.email, status: "active" }),
    ).toBe(1);
  } finally {
    await f.dispose();
  }
});

test("bounded SMTP failures retain only failed metadata and remove encrypted payload/Stream entry", async () => {
  const f = await createRegistrationEnvironment();
  try {
    const issued = await f.issue();
    const stream = `auth:${f.generation}:${f.namespace}:mail`;
    const sender = {
      send: async (): Promise<"accepted"> => {
        throw new Error("synthetic SMTP failure");
      },
    };
    const { z } = await import("zod");
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(
        await deliverCode({
          jobs: f.jobs,
          crypto: f.dependencies.crypto,
          sender,
          clock: f.clock,
        }),
      ).toBe("retry");
      const rows = z
        .array(z.tuple([z.string(), z.string(), z.number(), z.number()]))
        .parse(
          await f.broker.send("XPENDING", [
            stream,
            "registration-mail-v1",
            "-",
            "+",
            "1",
          ]),
        );
      const pending = rows[0];
      if (pending)
        await f.broker.send("XCLAIM", [
          stream,
          "registration-mail-v1",
          pending[1],
          "0",
          pending[0],
          "IDLE",
          "31000",
        ]);
    }
    expect(Number(await f.broker.send("XLEN", [stream]))).toBe(0);
    expect(
      await f.broker.get(
        `auth:${f.generation}:${f.namespace}:payload:${issued.challenge.version}`,
      ),
    ).toBeNull();
    expect(
      await f.broker.send("HGET", [
        `auth:${f.generation}:${f.namespace}:delivery:${issued.challenge.version}`,
        "state",
      ]),
    ).toBe("failed");
    expect(await f.mail(issued.email)).toHaveLength(0);
  } finally {
    await f.dispose();
  }
});
