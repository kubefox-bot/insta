import { expect, test } from "bun:test";
import { retryPastDeadline } from "../../../apps/be-insta/__tests__/integration/auth/retry";
import { loseFirstCommitReply } from "../../../apps/be-insta/__tests__/integration/users/commit-loss";
import { createMongoSessions } from "../../../apps/be-insta/src/domains/users/adapters/mongo/sessions";
import {
  authorizeSession,
  login,
  refresh,
} from "../../../apps/be-insta/src/domains/users/auth/index";
import { createAuthEnvironment } from "../../fixtures/users/auth-environment";

test("lost actual commit reply does not duplicate login or rotation; retry recovers canonical result", async () => {
  const f = await createAuthEnvironment();
  try {
    const account = await f.account();
    const loss = loseFirstCommitReply(f.database);
    const auth = {
      ...f.auth,
      sessions: createMongoSessions({ ...loss.connection, clock: f.clock }),
    };
    const first = await login({ ...account, operationId: f.operation() }, auth);
    if (first.isError()) throw new Error(first.getError());
    const credentials = first.get().credentials;
    expect(loss.observed()).toEqual({ lostReply: true, committedCalls: 2 });
    expect(
      await f.db
        .collection("users_sessions")
        .countDocuments({ backendSessionId: credentials.backendSessionId }),
    ).toBe(1);
    const rotationLoss = loseFirstCommitReply(f.database);
    const rotating = {
      ...f.auth,
      sessions: createMongoSessions({
        ...rotationLoss.connection,
        clock: f.clock,
      }),
    };
    const input = {
      refreshToken: credentials.refreshToken,
      idempotencyKey: crypto.randomUUID(),
      operationId: f.operation(),
    };
    const result = await refresh(input, rotating);
    const retry = await refresh(
      { ...input, operationId: f.operation() },
      f.auth,
    );
    expect(result.isOk()).toBe(true);
    expect(retry).toEqual(result);
    expect(rotationLoss.observed()).toEqual({
      lostReply: true,
      committedCalls: 2,
    });
    expect(
      await f.db.collection("users_outbox").countDocuments({
        backendSessionId: credentials.backendSessionId,
        type: "session_rotated",
      }),
    ).toBe(1);
  } finally {
    await f.dispose();
  }
});

test("TransientTransactionError retry crossing refresh deadline cannot persist prepared rotation", async () => {
  const f = await createAuthEnvironment();
  try {
    const account = await f.account();
    const first = await login(
      { ...account, operationId: f.operation() },
      f.auth,
    );
    if (first.isError()) throw new Error(first.getError());
    const credentials = first.get().credentials;
    const retry = retryPastDeadline({
      database: f.database,
      expire: () => f.advance(604800000),
    });
    const auth = {
      ...f.auth,
      sessions: createMongoSessions({ ...retry.connection, clock: f.clock }),
    };
    const result = await refresh(
      {
        refreshToken: credentials.refreshToken,
        idempotencyKey: crypto.randomUUID(),
        operationId: f.operation(),
      },
      auth,
    );
    expect(String(result.isError() && result.getError())).toBe(
      "REFRESH_TOKEN_EXPIRED",
    );
    expect(retry.observed()).toBe(2);
    const current = await f.db
      .collection("users_sessions")
      .findOne({ backendSessionId: credentials.backendSessionId });
    expect(current?.generation).toBe(0);
    expect(current?.expiresAt.getTime()).toBe(credentials.expiresAt);
    expect(
      await f.db.collection("users_outbox").countDocuments({
        backendSessionId: credentials.backendSessionId,
        type: "session_rotated",
      }),
    ).toBe(0);
  } finally {
    await f.dispose();
  }
});

test("canonical Mongo failure is a technical failure, never positive auth cache or logout", async () => {
  const f = await createAuthEnvironment();
  try {
    const account = await f.account();
    const issued = await login(
      { ...account, operationId: f.operation() },
      f.auth,
    );
    if (issued.isError()) throw new Error(issued.getError());
    const { connectDatabase } = await import(
      "../../../apps/be-insta/src/lib/database/index"
    );
    const { readTestApiConfig } = await import("../../fixtures/environment");
    const unavailable = await connectDatabase({
      config: readTestApiConfig().mongo,
    });
    const auth = {
      ...f.auth,
      sessions: createMongoSessions({ ...unavailable, clock: f.clock }),
    };
    expect(
      (
        await authorizeSession(
          { accessToken: issued.get().credentials.accessToken },
          auth,
        )
      ).isOk(),
    ).toBe(true);
    await unavailable.close();
    await expect(
      authorizeSession(
        { accessToken: issued.get().credentials.accessToken },
        auth,
      ),
    ).rejects.toThrow();
    expect(
      (
        await authorizeSession(
          { accessToken: issued.get().credentials.accessToken },
          f.auth,
        )
      ).isOk(),
    ).toBe(true);
  } finally {
    await f.dispose();
  }
});
