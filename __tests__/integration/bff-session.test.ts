import { expect, test } from "bun:test";
import { connectDatabase } from "../../apps/fe-insta/src/lib/database/server/index";
import { createMongoSessionStore } from "../../apps/fe-insta/src/lib/session/server/adapters/mongo/store";
import type { Binding } from "../../apps/fe-insta/src/lib/session/server/types";
import { readTestWebConfig } from "../fixtures/environment";

test("Mongo refresh lease takeover fences both old success and rejection and preserves revoke proof", async () => {
  const db = await connectDatabase({ config: readTestWebConfig().mongo });
  const store = createMongoSessionStore(db.webDb);
  const binding: Binding = {
    bindingId: crypto.randomUUID(),
    user: { id: "u", username: "user" },
    backendSessionId: crypto.randomUUID(),
    credentials: "encrypted-initial",
    revokeSecret: "encrypted-revoke",
    revision: 0,
    blocked: false,
    accessExpiresAt: 1000,
    expiresAt: 30000,
    absoluteExpiresAt: 200000,
  };
  try {
    await store.create(binding);
    const attempt = {
      key: crypto.randomUUID(),
      credentials: binding.credentials,
      revision: 0,
      startedAt: 1000,
      recoverUntil: 121000,
      leaseOwner: "process-1",
      leaseGeneration: 1,
      leaseUntil: 16000,
      state: "running" as const,
    };
    const first = await store.beginRefresh({
      bindingId: binding.bindingId,
      revision: 0,
      attempt,
      now: 1000,
    });
    expect(first?.attempt?.key).toBe(attempt.key);
    expect(
      await store.beginRefresh({
        bindingId: binding.bindingId,
        revision: 0,
        attempt: { ...attempt, key: "other" },
        now: 1000,
      }),
    ).toBeNull();
    if (!first) throw new Error("Missing first attempt");
    const takeover = await store.takeOver({
      binding: first,
      leaseOwner: "process-2",
      now: 16000,
    });
    expect(takeover?.attempt?.recoverUntil).toBe(121000);
    expect(takeover?.attempt?.leaseGeneration).toBe(2);
    const stale = {
      bindingId: binding.bindingId,
      revision: 0,
      key: attempt.key,
      leaseGeneration: 1,
      now: 16001,
    };
    expect(
      await store.finishRefresh({
        ...stale,
        outcome: {
          kind: "success",
          credentials: "old-result",
          accessExpiresAt: 20000,
          expiresAt: 90000,
        },
      }),
    ).toBe(false);
    expect(
      await store.finishRefresh({
        ...stale,
        leaseGeneration: 2,
        outcome: {
          kind: "success",
          credentials: "new-result",
          accessExpiresAt: 20000,
          expiresAt: 90000,
        },
      }),
    ).toBe(true);
    expect(
      await store.finishRefresh({ ...stale, outcome: { kind: "rejected" } }),
    ).toBe(false);
    const current = await store.read(binding.bindingId);
    expect(current?.blocked).toBe(false);
    expect(current?.revision).toBe(1);
    expect(current?.revokeSecret).toBe(binding.revokeSecret);
    await store.block({
      bindingId: binding.bindingId,
      backendSessionId: binding.backendSessionId,
    });
    expect((await store.read(binding.bindingId))?.blocked).toBe(true);
    await db.webDb
      .collection("bff_sessions")
      .deleteOne({ bindingId: binding.bindingId });
    expect(
      await store.finishRefresh({
        ...stale,
        outcome: {
          kind: "success",
          credentials: "resurrect",
          accessExpiresAt: 20000,
          expiresAt: 90000,
        },
      }),
    ).toBe(false);
    expect(await store.read(binding.bindingId)).toBeNull();
  } finally {
    await db.webDb
      .collection("bff_sessions")
      .deleteOne({ bindingId: binding.bindingId });
    await db.close();
  }
});

test("durable logout keeps its key through restart, retry waves and terminal confirmation", async () => {
  const db = await connectDatabase({ config: readTestWebConfig().mongo });
  const store = createMongoSessionStore(db.webDb);
  const binding: Binding = {
    bindingId: crypto.randomUUID(),
    user: { id: "u", username: "user" },
    backendSessionId: crypto.randomUUID(),
    credentials: "cipher",
    revokeSecret: "revoke-cipher",
    revision: 4,
    blocked: false,
    accessExpiresAt: 1000,
    expiresAt: 2000,
    absoluteExpiresAt: Date.now() + 100000,
    cleanupAt: new Date(Date.now() + 100000),
  };
  try {
    await store.create(binding);
    const saved = await store.beginRevocation({
      bindingId: binding.bindingId,
      key: "stable-command",
      now: 10,
    });
    expect(saved?.blocked).toBe(true);
    expect(saved?.cleanupAt).toBeUndefined();
    const restarted = createMongoSessionStore(db.webDb);
    expect(
      (await restarted.pendingRevocations(10)).some(
        (entry) => entry.bindingId === binding.bindingId,
      ),
    ).toBe(true);
    const retry = await restarted.beginRevocation({
      bindingId: binding.bindingId,
      key: "different-command",
      now: 11,
    });
    expect(retry?.revocation?.key).toBe("stable-command");
    await restarted.finishRevocation({
      bindingId: binding.bindingId,
      key: "stable-command",
      failures: 0,
      nextAttemptAt: 100,
      confirmed: true,
    });
    const again = await restarted.beginRevocation({
      bindingId: binding.bindingId,
      key: "must-not-create",
      now: 12,
    });
    expect(again?.revocation).toBeUndefined();
    expect(again?.blocked).toBe(true);
  } finally {
    await db.webDb
      .collection("bff_sessions")
      .deleteOne({ bindingId: binding.bindingId });
    await db.close();
  }
});
