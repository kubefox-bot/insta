import { expect, test } from "bun:test";
import {
  authorizeSession,
  login,
  refresh,
  revokeSession,
} from "../../apps/be-insta/src/domains/users/auth/index";
import { createAuthEnvironment } from "../fixtures/users/auth-environment";

test("native credentials rotate once under concurrent retry; old proof reuse revokes only its session", async () => {
  const f = await createAuthEnvironment();
  try {
    const account = await f.account();
    const first = await login(
      { ...account, operationId: f.operation() },
      f.auth,
    );
    const second = await login(
      { ...account, operationId: f.operation() },
      f.auth,
    );
    if (first.isError() || second.isError()) throw new Error("Login failed");
    const s1 = first.get().credentials;
    const s2 = second.get().credentials;
    expect(
      (await authorizeSession({ accessToken: s1.accessToken }, f.auth)).isOk(),
    ).toBe(true);
    const attempt = {
      refreshToken: s1.refreshToken,
      idempotencyKey: crypto.randomUUID(),
      operationId: f.operation(),
    };
    const results = await Promise.all([
      refresh(attempt, f.auth),
      refresh({ ...attempt, operationId: f.operation() }, f.auth),
    ]);
    expect(results.every((value) => value.isOk())).toBe(true);
    const rotated = results[0];
    const replayed = results[1];
    if (!rotated?.isOk() || !replayed?.isOk())
      throw new Error("Refresh failed");
    expect(replayed.get()).toEqual(rotated.get());
    expect(rotated.get().credentials).not.toHaveProperty("revokeSecret");
    const binding = { ...s1, ...rotated.get().credentials };
    expect(binding.revokeSecret).toBe(s1.revokeSecret);
    const persisted = await f.db
      .collection("users_sessions")
      .findOne({ backendSessionId: s1.backendSessionId });
    expect(persisted?.generation).toBe(1);
    expect(persisted?.previousRefresh).toHaveLength(1);
    expect(
      await f.db.collection("users_outbox").countDocuments({
        backendSessionId: s1.backendSessionId,
        type: "session_rotated",
      }),
    ).toBe(1);
    const reuse = await refresh(
      { ...attempt, idempotencyKey: crypto.randomUUID() },
      f.auth,
    );
    expect(String(reuse.isError() && reuse.getError())).toBe("SESSION_REVOKED");
    const denied = await authorizeSession(
      { accessToken: binding.accessToken },
      f.auth,
    );
    expect(String(denied.isError() && denied.getError())).toBe(
      "SESSION_REVOKED",
    );
    expect(
      (await authorizeSession({ accessToken: s2.accessToken }, f.auth)).isOk(),
    ).toBe(true);
    const confirmation = await revokeSession(
      {
        backendSessionId: s1.backendSessionId as typeof f.sessionId,
        revokeSecret: s1.revokeSecret,
      },
      f.auth,
    );
    expect(confirmation.isOk() && confirmation.get().state).toBe("revoked");
  } finally {
    await f.dispose();
  }
});

test("replay cutoff and future rotation never extend or resurrect credentials; expiry proof only confirms", async () => {
  const f = await createAuthEnvironment();
  try {
    const account = await f.account();
    const issued = await login(
      { ...account, operationId: f.operation() },
      f.auth,
    );
    if (issued.isError()) throw new Error("Login failed");
    const initial = issued.get().credentials;
    f.advance(604799000);
    const attempt = {
      refreshToken: initial.refreshToken,
      idempotencyKey: crypto.randomUUID(),
      operationId: f.operation(),
    };
    const rotated = await refresh(attempt, f.auth);
    if (rotated.isError()) throw new Error(rotated.getError());
    expect(rotated.get().credentials.expiresAt).toBe(f.clock() + 604800000);
    f.advance(119999);
    expect((await refresh(attempt, f.auth)).isOk()).toBe(true);
    f.advance(1);
    const cutoff = await refresh(attempt, f.auth);
    expect(String(cutoff.isError() && cutoff.getError())).toBe(
      "REFRESH_TOKEN_INVALID",
    );
    const next = await refresh(
      {
        refreshToken: rotated.get().credentials.refreshToken,
        idempotencyKey: crypto.randomUUID(),
        operationId: f.operation(),
      },
      f.auth,
    );
    expect(next.isOk()).toBe(true);
    expect((await refresh(attempt, f.auth)).isError()).toBe(true);
    const before = await f.db
      .collection("users_sessions")
      .findOne({ backendSessionId: initial.backendSessionId });
    f.advance(2592000000);
    const confirmed = await revokeSession(
      {
        backendSessionId: initial.backendSessionId as typeof f.sessionId,
        revokeSecret: initial.revokeSecret,
      },
      f.auth,
    );
    expect(confirmed.isOk() && confirmed.get().state).toBe("expired");
    expect(
      await f.db
        .collection("users_sessions")
        .findOne({ backendSessionId: initial.backendSessionId }),
    ).toEqual(before);
    expect(
      await f.db.collection("users_outbox").countDocuments({
        backendSessionId: initial.backendSessionId,
        type: "logout_completed",
      }),
    ).toBe(0);
  } finally {
    await f.dispose();
  }
});

test("random revoke proof cannot read or rotate and repeated valid revoke emits one canonical logout", async () => {
  const f = await createAuthEnvironment();
  try {
    const account = await f.account();
    const issued = await login(
      { ...account, operationId: f.operation() },
      f.auth,
    );
    if (issued.isError()) throw new Error("Login failed");
    const credentials = issued.get().credentials;
    expect(
      (
        await authorizeSession(
          { accessToken: credentials.revokeSecret },
          f.auth,
        )
      ).isError(),
    ).toBe(true);
    expect(
      (
        await refresh(
          {
            refreshToken: credentials.revokeSecret,
            operationId: f.operation(),
          },
          f.auth,
        )
      ).isError(),
    ).toBe(true);
    const input = {
      backendSessionId: credentials.backendSessionId as typeof f.sessionId,
      revokeSecret: credentials.revokeSecret,
    };
    expect(
      (
        await revokeSession(
          { ...input, revokeSecret: f.auth.tokens.secret() },
          f.auth,
        )
      ).isError(),
    ).toBe(true);
    expect(
      (
        await revokeSession({ ...input, backendSessionId: f.sessionId }, f.auth)
      ).isError(),
    ).toBe(true);
    const first = await revokeSession(input, f.auth);
    const second = await revokeSession(input, f.auth);
    expect(first.isOk()).toBe(true);
    expect(second).toEqual(first);
    expect(
      await f.db.collection("users_outbox").countDocuments({
        backendSessionId: credentials.backendSessionId,
        type: "logout_completed",
      }),
    ).toBe(1);
  } finally {
    await f.dispose();
  }
});

test("seven-day slides reach fixed thirty-day cap and old generation evidence survives replay deletion", async () => {
  const f = await createAuthEnvironment();
  try {
    const account = await f.account();
    const issued = await login(
      { ...account, operationId: f.operation() },
      f.auth,
    );
    if (issued.isError()) throw new Error(issued.getError());
    const original = issued.get().credentials;
    let current = original.refreshToken;
    for (let day = 0; day < 4; day += 1) {
      f.advance(518400000);
      const rotated = await refresh(
        {
          refreshToken: current,
          idempotencyKey: crypto.randomUUID(),
          operationId: f.operation(),
        },
        f.auth,
      );
      if (rotated.isError()) throw new Error(rotated.getError());
      expect(rotated.get().credentials.absoluteExpiresAt).toBe(
        original.absoluteExpiresAt,
      );
      current = rotated.get().credentials.refreshToken;
    }
    const capped = await f.auth.sessions.read(
      original.backendSessionId as typeof f.sessionId,
    );
    expect(capped?.expiresAt).toBe(original.absoluteExpiresAt);
    // Simulate the TTL monitor deleting only this run-owned result; session evidence remains.
    await f.db
      .collection("users_auth_replays")
      .deleteMany({ backendSessionId: original.backendSessionId });
    const reused = await refresh(
      {
        refreshToken: original.refreshToken,
        idempotencyKey: crypto.randomUUID(),
        operationId: f.operation(),
      },
      f.auth,
    );
    expect(String(reused.isError() && reused.getError())).toBe(
      "SESSION_REVOKED",
    );
    expect(
      (
        await f.auth.sessions.read(
          original.backendSessionId as typeof f.sessionId,
        )
      )?.state,
    ).toBe("revoked");
  } finally {
    await f.dispose();
  }
});

test("same original proof and key stop replaying after another generation even inside retention", async () => {
  const f = await createAuthEnvironment();
  try {
    const account = await f.account();
    const issued = await login(
      { ...account, operationId: f.operation() },
      f.auth,
    );
    if (issued.isError()) throw new Error(issued.getError());
    const firstInput = {
      refreshToken: issued.get().credentials.refreshToken,
      idempotencyKey: crypto.randomUUID(),
      operationId: f.operation(),
    };
    const first = await refresh(firstInput, f.auth);
    if (first.isError()) throw new Error(first.getError());
    const second = await refresh(
      {
        refreshToken: first.get().credentials.refreshToken,
        idempotencyKey: crypto.randomUUID(),
        operationId: f.operation(),
      },
      f.auth,
    );
    if (second.isError()) throw new Error(second.getError());
    const obsolete = await refresh(firstInput, f.auth);
    expect(String(obsolete.isError() && obsolete.getError())).toBe(
      "REFRESH_TOKEN_INVALID",
    );
    expect(
      (
        await authorizeSession(
          { accessToken: second.get().credentials.accessToken },
          f.auth,
        )
      ).isOk(),
    ).toBe(true);
    const current = await f.auth.sessions.read(
      second.get().credentials.backendSessionId as typeof f.sessionId,
    );
    expect(current?.generation).toBe(2);
  } finally {
    await f.dispose();
  }
});
