import { expect, test } from "bun:test";
import { createSessionId } from "../../apps/be-insta/src/domains/users/adapters/mongo/mapper";
import type {
  Activation,
  PendingUser,
} from "../../apps/be-insta/src/domains/users/domain/types";
import { createUsersEnvironment } from "../fixtures/users/environment";

test("pending user has no private access or password; unique email and replaced proof are real", async () => {
  const fixture = await createUsersEnvironment();
  try {
    const now = Date.now();
    const email = fixture.email("pending");
    const request = {
      email,
      now,
      emailVerifiedAt: now,
      registrationExpiresAt: now + 60000,
      tokenDigest: `${fixture.runId}-old`,
    };
    const first = await fixture.persistence.createPending(request);
    expect(first.isOk()).toBe(true);
    if (first.isError()) throw new Error(first.getError());
    expect(first.get().status).toBe("pending_setup");
    const raw = await fixture.db
      .collection("users")
      .findOne({ emailKey: first.get().emailKey });
    expect(raw).not.toHaveProperty("passwordHash");
    expect(raw).not.toHaveProperty("usernameKey");
    if (!raw) throw new Error("Missing synthetic pending user");
    expect(
      await fixture.db
        .collection("users_sessions")
        .countDocuments({ userId: raw._id }),
    ).toBe(0);
    const duplicate = await fixture.persistence.createPending({
      ...request,
      email: email.toUpperCase(),
      tokenDigest: `${fixture.runId}-other`,
    });
    expect(duplicate.isError() && duplicate.getError()).toBe("emailExists");
    const replacement = await fixture.persistence.replaceProof({
      userId: first.get().id,
      tokenDigest: `${fixture.runId}-new`,
      emailVerifiedAt: now + 1,
      now: now + 1,
    });
    expect(replacement.isOk()).toBe(true);
    expect(
      await fixture.db
        .collection("users_registration_proofs")
        .countDocuments({ tokenDigest: request.tokenDigest }),
    ).toBe(0);
    expect(replacement.isOk() && replacement.get().registrationExpiresAt).toBe(
      request.registrationExpiresAt,
    );
  } finally {
    await fixture.dispose();
  }
});

test("activation consumes proof, stores only credential digests and commits bounded replay atomically", async () => {
  const fixture = await createUsersEnvironment();
  try {
    const now = Date.now();
    const create = async (name: string): Promise<PendingUser> => {
      const result = await fixture.persistence.createPending({
        email: fixture.email(name),
        now,
        emailVerifiedAt: now,
        registrationExpiresAt: now + 60000,
        tokenDigest: `${fixture.runId}-${name}`,
      });
      if (result.isError()) throw new Error(result.getError());
      return result.get();
    };
    const pending = await create("first");
    const username = `U_${fixture.runId.slice(-20).replaceAll("-", "_")}`;
    const activation: Activation = {
      userId: pending.id,
      tokenDigest: `${fixture.runId}-first`,
      username,
      passwordHash: "$argon2id$synthetic",
      now,
      operationId: fixture.operation(),
      session: {
        backendSessionId: createSessionId(),
        refreshDigest: "a".repeat(64),
        revokeDigest: "b".repeat(64),
        issuedAt: now,
        expiresAt: now + 7 * 86400000,
        absoluteExpiresAt: now + 30 * 86400000,
      },
      replay: {
        keyDigest: "c".repeat(64),
        fingerprint: "d".repeat(64),
        ciphertext: "synthetic-encrypted-result",
      },
    };
    const results = await Promise.all([
      fixture.persistence.activateAndIssueSession(activation),
      fixture.persistence.activateAndIssueSession(activation),
    ]);
    expect(results.every((result) => result.isOk())).toBe(true);
    expect(
      results.filter(
        (result) => result.isOk() && result.get().state === "activated",
      ),
    ).toHaveLength(1);
    expect(
      results.filter(
        (result) => result.isOk() && result.get().state === "replayed",
      ),
    ).toHaveLength(1);
    const laterReplay = await fixture.persistence.activateAndIssueSession({
      ...activation,
      now: now + 1,
    });
    expect(laterReplay.isOk() && laterReplay.get().state).toBe("replayed");
    const sid = activation.session.backendSessionId;
    expect(
      await fixture.db
        .collection("users_sessions")
        .countDocuments({ backendSessionId: sid }),
    ).toBe(1);
    const stored = await fixture.db
      .collection("users_sessions")
      .findOne({ backendSessionId: sid });
    expect(stored).toMatchObject({
      refreshDigest: activation.session.refreshDigest,
      revokeDigest: activation.session.revokeDigest,
      generation: 0,
    });
    expect(stored).not.toHaveProperty("refreshToken");
    expect(stored).not.toHaveProperty("revokeSecret");
    expect(
      await fixture.db
        .collection("users_outbox")
        .countDocuments({ operationId: activation.operationId }),
    ).toBe(1);
    const replay = await fixture.db
      .collection("users_auth_replays")
      .findOne({ backendSessionId: sid });
    expect(replay?.expiresAt.getTime()).toBe(now + 60000);
    const changed = await fixture.persistence.activateAndIssueSession({
      ...activation,
      replay: {
        ...activation.replay,
        keyDigest: "c".repeat(64),
        ciphertext: "synthetic-encrypted-result",
        fingerprint: "f".repeat(64),
      },
    });
    expect(changed.isError() && changed.getError()).toBe("conflict");
    const expired = await fixture.persistence.activateAndIssueSession({
      ...activation,
      now: now + 60000,
    });
    expect(expired.isError() && expired.getError()).toBe("invalidProof");
    const staleReplay = await fixture
      .persistenceWithClock(() => now + 60000)
      .activateAndIssueSession(activation);
    expect(staleReplay.isError() && staleReplay.getError()).toBe(
      "invalidProof",
    );
    const other = await create("second");
    const collision = await fixture.persistence.activateAndIssueSession({
      ...activation,
      userId: other.id,
      tokenDigest: `${fixture.runId}-second`,
      username: username.toLowerCase(),
      operationId: fixture.operation(),
      session: { ...activation.session, backendSessionId: createSessionId() },
    });
    expect(collision.isError() && collision.getError()).toBe("usernameTaken");
    expect(
      (
        await fixture.db
          .collection("users")
          .findOne({ emailKey: other.emailKey })
      )?.status,
    ).toBe("pending_setup");
    expect(
      (
        await fixture.db
          .collection("users_registration_proofs")
          .findOne({ tokenDigest: `${fixture.runId}-second` })
      )?.state,
    ).toBe("pending");
    await fixture.db
      .collection("users_sessions")
      .updateOne({ backendSessionId: sid }, { $set: { state: "revoked" } });
    expect(
      (await fixture.persistence.activateAndIssueSession(activation)).isError(),
    ).toBe(true);
    const indexes = await fixture.db.collection("users_sessions").indexes();
    expect(indexes.some((index) => "expireAfterSeconds" in index)).toBe(false);
  } finally {
    await fixture.dispose();
  }
});

test("unknown commit reply retries driver commit and preserves exactly one persisted result", async () => {
  const fixture = await createUsersEnvironment();
  try {
    const now = Date.now();
    const request = {
      email: fixture.email("commit-loss"),
      now,
      emailVerifiedAt: now,
      registrationExpiresAt: now + 60000,
      tokenDigest: `${fixture.runId}-commit-loss`,
    };
    const result = await fixture.commitLossPersistence.createPending(request);
    expect(result.isOk()).toBe(true);
    expect(fixture.observedCommitLoss()).toEqual({
      lostReply: true,
      committedCalls: 2,
    });
    expect(
      await fixture.db
        .collection("users")
        .countDocuments({ emailKey: request.email }),
    ).toBe(1);
    expect(
      await fixture.db
        .collection("users_registration_proofs")
        .countDocuments({ tokenDigest: request.tokenDigest }),
    ).toBe(1);
    const duplicate = await fixture.persistence.createPending(request);
    expect(duplicate.isError() && duplicate.getError()).toBe("emailExists");
  } finally {
    await fixture.dispose();
  }
});

test("transaction checks current server expiry despite a stale request timestamp", async () => {
  const fixture = await createUsersEnvironment();
  try {
    const now = Date.now();
    const request = {
      email: fixture.email("deadline"),
      now,
      emailVerifiedAt: now,
      registrationExpiresAt: now + 60000,
      tokenDigest: `${fixture.runId}-deadline`,
    };
    const pending = await fixture.persistence.createPending(request);
    if (pending.isError()) throw new Error(pending.getError());
    const atDeadline = fixture.persistenceWithClock(
      () => request.registrationExpiresAt,
    );
    const result = await atDeadline.activateAndIssueSession({
      userId: pending.get().id,
      tokenDigest: request.tokenDigest,
      username: `U_${fixture.runId.slice(-20).replaceAll("-", "_")}`,
      passwordHash: "$argon2id$synthetic",
      now,
      operationId: fixture.operation(),
      session: {
        backendSessionId: createSessionId(),
        refreshDigest: "a".repeat(64),
        revokeDigest: "b".repeat(64),
        issuedAt: now,
        expiresAt: now + 604800000,
        absoluteExpiresAt: now + 2592000000,
      },
    });
    expect(result.isError() && result.getError()).toBe("registrationExpired");
    expect(
      (
        await fixture.db
          .collection("users")
          .findOne({ emailKey: request.email })
      )?.status,
    ).toBe("pending_setup");
    const replaced = await atDeadline.replaceProof({
      userId: pending.get().id,
      tokenDigest: `${fixture.runId}-expired-replacement`,
      emailVerifiedAt: now,
      now,
    });
    expect(replaced.isError() && replaced.getError()).toBe(
      "registrationExpired",
    );
    const expiredCreate = await atDeadline.createPending({
      ...request,
      email: fixture.email("expired-create"),
      tokenDigest: `${fixture.runId}-expired-create`,
    });
    expect(expiredCreate.isError() && expiredCreate.getError()).toBe(
      "registrationExpired",
    );
    expect(
      await fixture.db.collection("users").countDocuments({
        emailKey: `${fixture.runId}-expired-create@example.test`,
      }),
    ).toBe(0);
  } finally {
    await fixture.dispose();
  }
});
