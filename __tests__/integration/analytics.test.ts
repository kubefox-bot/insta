const logOnlySink = "log_only";

import { expect, test } from "bun:test";
import { createSessionId } from "../../apps/be-insta/src/domains/users/server/index";
import { createUsersEnvironment } from "../fixtures/users/environment";

test("DONE-01 registration canonical is atomic with active user and session and replay preserves its ID", async () => {
  const fixture = await createUsersEnvironment({
    collectionNamespace: `test_chat03_runtime_${crypto.randomUUID().replaceAll("-", "")}_`,
  });
  try {
    const now = Date.now();
    const tokenDigest = `${fixture.runId}-canonical`;
    const pending = await fixture.persistence.createPending({
      email: fixture.email("canonical"),
      tokenDigest,
      now,
      emailVerifiedAt: now,
      registrationExpiresAt: now + 60000,
    });
    if (pending.isError()) throw new Error(pending.getError());
    const operationId = fixture.operation();
    const input = {
      userId: pending.get().id,
      tokenDigest,
      username: `U_${fixture.runId.slice(-20).replaceAll("-", "_")}`,
      passwordHash: "$argon2id$synthetic",
      now,
      operationId,
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
        ciphertext: "synthetic",
      },
    };
    const committed = await fixture.persistence.activateAndIssueSession(input);
    expect(committed.isOk()).toBe(true);
    const first = await fixture.db
      .collection("users_outbox")
      .findOne({ operationId });
    expect(first?.authority).toBe("server_canonical");
    expect(first?.analyticsEventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(first?.operation).toBe("registration.complete");
    expect(first?.code).toBe("USER_ACTIVATED");
    expect(first?.projection).toBeUndefined();
    expect(
      (await fixture.persistence.activateAndIssueSession(input)).isOk(),
    ).toBe(true);
    const rows = await fixture.db
      .collection("users_outbox")
      .find({ operationId })
      .toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.analyticsEventId).toBe(first?.analyticsEventId);
    const active = await fixture.db
      .collection("users")
      .findOne({ emailKey: fixture.email("canonical") });
    expect(active?.status).toBe("active");
    expect(
      await fixture.db
        .collection("users_sessions")
        .countDocuments({ backendSessionId: input.session.backendSessionId }),
    ).toBe(1);
  } finally {
    await fixture.dispose();
  }
});
test("DONE-01 real canonical projection claims independent sinks and permanently denies the original stale revision", async () => {
  const module = await import(
    "../../apps/be-insta/src/lib/observability/analytics/outbox"
  ).catch(() => undefined);
  expect(module).toBeDefined();
  if (!module) return;
  const fixture = await createUsersEnvironment({
    collectionNamespace: `test_chat03_runtime_${crypto.randomUUID().replaceAll("-", "")}_`,
  });
  try {
    const operationId = fixture.operation();
    const analyticsEventId = crypto.randomUUID();
    await fixture.db.collection("users_outbox").insertOne({
      operationId,
      analyticsEventId,
      effectId: "synthetic-effect",
      operation: "test.commit",
      code: "SAVED",
      authority: "server_canonical",
      occurredAt: Date.now(),
      projection: {
        reference: {
          contextId: "synthetic",
          revision: 1,
          policyVersion: 1,
          generation: "synthetic",
        },
        deliveries: {
          [logOnlySink]: { state: "pending", leaseUntil: 0, nextAttemptAt: 0 },
          otel: { state: "pending", leaseUntil: 0, nextAttemptAt: 0 },
        },
      },
    });
    const outbox = module.createCanonicalOutbox({
      db: fixture.db,
      collection: "users_outbox",
      scope: { operationId },
      mappings: [
        {
          operation: "test.commit",
          successCodes: ["SAVED"],
          authority: "server_canonical",
          goal: "test_saved",
        },
      ],
    });
    const first = await outbox.claim({
      sink: "log_only",
      now: Date.now(),
      leaseId: crypto.randomUUID(),
    });
    expect(first?.record.analyticsEventId).toBe(analyticsEventId);
    if (!first) throw new Error("missing projection claim");
    expect(
      await outbox.claim({
        sink: "log_only",
        now: Date.now(),
        leaseId: crypto.randomUUID(),
      }),
    ).toBeNull();
    expect(
      await outbox.finish({ claim: first, state: "denied", now: Date.now() }),
    ).toBe(true);
    expect(
      await outbox.claim({
        sink: "log_only",
        now: Date.now() + 100000,
        leaseId: crypto.randomUUID(),
      }),
    ).toBeNull();
    const other = await outbox.claim({
      sink: "otel",
      now: Date.now(),
      leaseId: crypto.randomUUID(),
    });
    expect(other?.record.analyticsEventId).toBe(analyticsEventId);
    const raw = await fixture.db
      .collection("users_outbox")
      .findOne({ operationId });
    expect(raw?.projection.deliveries.log_only.state).toBe("denied");
    expect(raw?.projection.deliveries.otel.state).toBe("pending");
  } finally {
    await fixture.dispose();
  }
});
test("cross-capability effects share one operation with distinct IDs and repeat revoked never creates another goal", async () => {
  const { createMongoSessions, createSessionId } = await import(
    "../../apps/be-insta/src/domains/users/server/index"
  );
  const { submitReport } = await import(
    "../../apps/be-insta/src/domains/support-reports/use-cases/submit"
  );
  const { createSupportEnvironment } = await import(
    "../fixtures/support/environment"
  );
  const { activateCanonicalUser } = await import("../fixtures/analytics/user");
  const fixture = await createUsersEnvironment({
    collectionNamespace: `test_chat03_runtime_${crypto.randomUUID().replaceAll("-", "")}_`,
  });
  try {
    const support = await createSupportEnvironment();
    try {
      const active = await activateCanonicalUser({ fixture });
      const input = {
        ...(await support.input()),
        operationId: active.input.operationId,
      };
      const saved = await submitReport(input, support.dependencies);
      if (saved.isError()) throw new Error(saved.getError());
      const first = await fixture.db
        .collection("users_outbox")
        .findOne({ operationId: active.input.operationId });
      const second = await support.db
        .collection(support.collections.outbox)
        .findOne({ operationId: active.input.operationId });
      expect(first?.analyticsEventId).toMatch(/^[0-9a-f-]{36}$/);
      expect(second?.analyticsEventId).toMatch(/^[0-9a-f-]{36}$/);
      expect(
        new Set([first?.analyticsEventId, second?.analyticsEventId]).size,
      ).toBe(2);
      expect((await submitReport(input, support.dependencies)).isOk()).toBe(
        true,
      );
      expect(
        await support.db
          .collection(support.collections.outbox)
          .countDocuments({ operationId: active.input.operationId }),
      ).toBe(1);
      const sessions = createMongoSessions({
        ...fixture.database,
        clock: Date.now,
      });
      const loginSession = {
        ...active.input.session,
        backendSessionId: createSessionId(),
      };
      expect(
        (
          await sessions.issue({
            userId: active.input.userId,
            session: loginSession,
            operationId: fixture.operation(),
          })
        ).isOk(),
      ).toBe(true);
      const revokedOperation = fixture.operation();
      const revoke = {
        backendSessionId: loginSession.backendSessionId,
        proof: { kind: "secret" as const, digest: loginSession.revokeDigest },
        operationId: revokedOperation,
      };
      expect((await sessions.revoke(revoke)).isOk()).toBe(true);
      const original = await fixture.db
        .collection("users_outbox")
        .findOne({ operationId: revokedOperation });
      const repeat = await sessions.revoke({
        ...revoke,
        operationId: fixture.operation(),
      });
      expect(repeat.isOk() && repeat.get().operationId).toBe(revokedOperation);
      const rows = await fixture.db
        .collection("users_outbox")
        .find({
          backendSessionId: loginSession.backendSessionId,
          type: "logout_completed",
        })
        .toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.analyticsEventId).toBe(original?.analyticsEventId);
    } finally {
      await support.dispose();
    }
  } finally {
    await fixture.dispose();
  }
});
