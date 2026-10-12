import { expect, test } from "bun:test";
import {
  createLogOnlySink,
  dispatchGoal,
} from "@insta/fe-core/observability/analytics";
import {
  allowAnalytics,
  resolveAnalyticsReference,
  savePreference,
} from "../../../apps/be-insta/src/domains/privacy/index";
import { createCanonicalOutbox } from "../../../apps/be-insta/src/lib/observability/analytics/index";
import { activateCanonicalUser } from "../../fixtures/analytics/user";
import { createPrivacyEnvironment } from "../../fixtures/privacy-environment";
import { createUsersEnvironment } from "../../fixtures/users/environment";

test("A24 original current proof eligibility is permanent, revoked revision cannot backfill after a new all", async () => {
  const users = await createUsersEnvironment({
    collectionNamespace: `test_chat03_runtime_${crypto.randomUUID().replaceAll("-", "")}_`,
  });
  const privacy = await createPrivacyEnvironment();
  try {
    const first = await savePreference(
      { choice: "all", policyVersion: 1, source: privacy.source },
      privacy.dependencies,
    );
    if (first.isError()) throw new Error(first.getError());
    const reference = await resolveAnalyticsReference(
      { contextProof: first.get().contextProof },
      privacy.dependencies,
    );
    if (!reference) throw new Error("Missing verified proof reference");
    const committed = await activateCanonicalUser({
      fixture: users,
      reference,
    });
    const native = await activateCanonicalUser({ fixture: users });
    const before = await users.db
      .collection("users_outbox")
      .findOne({ operationId: native.input.operationId });
    expect(before?.projection).toBeUndefined();
    const denied = await savePreference(
      {
        choice: "necessary",
        policyVersion: 1,
        contextProof: first.get().contextProof,
        expectedRevision: 1,
        source: privacy.source,
      },
      privacy.dependencies,
    );
    if (denied.isError()) throw new Error(denied.getError());
    const renewed = await savePreference(
      {
        choice: "all",
        policyVersion: 1,
        contextProof: first.get().contextProof,
        expectedRevision: 2,
        source: privacy.source,
      },
      privacy.dependencies,
    );
    expect(renewed.isOk()).toBe(true);
    const mapping = {
      operation: "registration.complete",
      successCodes: ["USER_ACTIVATED"],
      authority: "server_canonical" as const,
      goal: "registration_completed",
    };
    const outbox = createCanonicalOutbox({
      db: users.db,
      collection: "users_outbox",
      scope: { operationId: committed.input.operationId },
      mappings: [mapping],
    });
    const claim = await outbox.claim({
      sink: "log_only",
      now: Date.now(),
      leaseId: crypto.randomUUID(),
    });
    if (!claim) throw new Error("Missing original projection");
    const emitted: unknown[] = [];
    const result = await dispatchGoal({
      record: claim.record,
      mapping,
      permission: (reference) =>
        allowAnalytics({ reference }, privacy.dependencies),
      sink: createLogOnlySink({ emit: (record) => emitted.push(record) }),
    });
    expect(result.isOk() && result.get()).toBe("no_goal");
    expect(emitted).toEqual([]);
    expect(
      await outbox.finish({ claim, state: "denied", now: Date.now() }),
    ).toBe(true);
    expect(
      await outbox.claim({
        sink: "log_only",
        now: Date.now() + 60000,
        leaseId: crypto.randomUUID(),
      }),
    ).toBeNull();
    expect(
      (await native.persistence.activateAndIssueSession(native.input)).isOk(),
    ).toBe(true);
    expect(
      (
        await users.db
          .collection("users_outbox")
          .findOne({ operationId: native.input.operationId })
      )?.projection,
    ).toBeUndefined();
  } finally {
    await privacy.dispose();
    await users.dispose();
  }
});

test("A23 sink failure preserves committed canonical identity and native authorization while client authority gets no goal", async () => {
  const users = await createUsersEnvironment({
    collectionNamespace: `test_chat03_runtime_${crypto.randomUUID().replaceAll("-", "")}_`,
  });
  const privacy = await createPrivacyEnvironment();
  try {
    const first = await savePreference(
      { choice: "all", policyVersion: 1, source: privacy.source },
      privacy.dependencies,
    );
    if (first.isError()) throw new Error(first.getError());
    const reference = await resolveAnalyticsReference(
      { contextProof: first.get().contextProof },
      privacy.dependencies,
    );
    if (!reference) throw new Error("Missing reference");
    const committed = await activateCanonicalUser({
      fixture: users,
      reference,
    });
    const mapping = {
      operation: "registration.complete",
      successCodes: ["USER_ACTIVATED"],
      authority: "server_canonical" as const,
      goal: "registration_completed",
    };
    const outbox = createCanonicalOutbox({
      db: users.db,
      collection: "users_outbox",
      scope: { operationId: committed.input.operationId },
      mappings: [mapping],
    });
    const claim = await outbox.claim({
      sink: "log_only",
      now: Date.now(),
      leaseId: crypto.randomUUID(),
    });
    if (!claim) throw new Error("Missing projection");
    const sink = createLogOnlySink({
      emit: () => {
        throw new Error("CANARY_LOGGER_OUTAGE");
      },
    });
    const permission = (
      reference: NonNullable<typeof claim.record.reference>,
    ) => allowAnalytics({ reference }, privacy.dependencies);
    const failed = await dispatchGoal({
      record: claim.record,
      mapping,
      sink,
      permission,
    });
    expect(failed.isError() && failed.getError()).toBe("sink_unavailable");
    expect(
      (
        await committed.persistence.activateAndIssueSession(committed.input)
      ).isOk(),
    ).toBe(true);
    const rows = await users.db
      .collection("users_outbox")
      .find({ operationId: committed.input.operationId })
      .toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.analyticsEventId).toBe(claim.record.analyticsEventId);
    const client = await dispatchGoal({
      record: { ...claim.record, authority: "client_observed" },
      mapping,
      sink,
      permission,
    });
    expect(client.isOk() && client.get()).toBe("no_goal");
  } finally {
    await privacy.dispose();
    await users.dispose();
  }
});
test("optional metadata reader outage cannot prevent native registration effect", async () => {
  const users = await createUsersEnvironment({
    collectionNamespace: `test_chat03_runtime_${crypto.randomUUID().replaceAll("-", "")}_`,
  });
  try {
    const committed = await activateCanonicalUser({
      fixture: users,
      readReference: () => {
        throw new Error("CANARY_METADATA_OUTAGE");
      },
    });
    expect(committed.result.isOk()).toBe(true);
    const stored = await users.db
      .collection("users_outbox")
      .findOne({ operationId: committed.input.operationId });
    expect(stored?.authority).toBe("server_canonical");
    expect(stored?.projection).toBeUndefined();
  } finally {
    await users.dispose();
  }
});

test("A24 arbitrary caller proof cannot create a projection or block the canonical business effect", async () => {
  const users = await createUsersEnvironment({
    collectionNamespace: `test_chat03_runtime_${crypto.randomUUID().replaceAll("-", "")}_`,
  });
  const privacy = await createPrivacyEnvironment();
  try {
    const reference = await resolveAnalyticsReference(
      { contextProof: privacy.dependencies.random.proof() },
      privacy.dependencies,
    );
    expect(reference).toBeUndefined();
    const committed = await activateCanonicalUser({
      fixture: users,
      reference,
    });
    expect(committed.result.isOk()).toBe(true);
    const stored = await users.db
      .collection("users_outbox")
      .findOne({ operationId: committed.input.operationId });
    expect(stored?.authority).toBe("server_canonical");
    expect(stored?.analyticsEventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(stored?.projection).toBeUndefined();
  } finally {
    await privacy.dispose();
    await users.dispose();
  }
});
