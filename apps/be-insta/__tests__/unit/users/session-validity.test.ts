import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode } from "@insta/contracts/errors";
import { unavailableAuth } from "../../../src/app/composition/users/unavailable";
import type { AuthSession } from "../../../src/domains/users/auth/domain/types";
import {
  authorizeActorSession,
  authorizeSession,
  type SessionId,
  type UserId,
} from "../../../src/domains/users/index";

const userId = "000000000000000000000001" as UserId;
const backendSessionId = "fixture-session" as SessionId;
const actor = {
  userId,
  backendSessionId,
  username: "original",
  accessExpiresAt: 100,
};
const session: AuthSession = {
  backendSessionId,
  user: { id: userId, username: "updated" },
  refreshDigest: "refresh",
  revokeDigest: "revoke",
  generation: 0,
  state: "active",
  issuedAt: 0,
  expiresAt: 200,
  absoluteExpiresAt: 300,
};

for (const [current, accessExpiresAt, expected] of [
  [null, 100, AuthErrorCode.AccessTokenInvalid],
  [
    {
      ...session,
      user: { ...session.user, id: "other" as UserId },
      state: "revoked" as const,
    },
    100,
    AuthErrorCode.AccessTokenInvalid,
  ],
  [
    { ...session, state: "revoked" as const, expiresAt: 1 },
    1,
    AuthErrorCode.SessionRevoked,
  ],
  [{ ...session, expiresAt: 50 }, 1, AuthErrorCode.RefreshTokenExpired],
  [session, 50, AuthErrorCode.AccessTokenExpired],
] as const) {
  test(`both authorization flows preserve ${expected} precedence`, async () => {
    const auth = {
      ...unavailableAuth,
      clock: () => 50,
      tokens: {
        ...unavailableAuth.tokens,
        verifyAccess: async () =>
          Result.Ok({ userId, backendSessionId, accessExpiresAt }),
      },
      sessions: {
        ...unavailableAuth.sessions,
        read: async () => current,
      },
    };
    const byToken = await authorizeSession({ accessToken: "fixture" }, auth);
    const byActor = await authorizeActorSession(
      { actor: { ...actor, accessExpiresAt } },
      auth,
    );
    expect(byToken.isError()).toBe(true);
    expect(byActor.isError()).toBe(true);
    if (byToken.isError() && byActor.isError()) {
      expect(byToken.getError()).toBe(expected);
      expect(byActor.getError()).toBe(expected);
    }
  });
}

test("token authorization refreshes username while actor authorization retains its snapshot", async () => {
  const auth = {
    ...unavailableAuth,
    clock: () => 50,
    tokens: {
      ...unavailableAuth.tokens,
      verifyAccess: async () =>
        Result.Ok({ userId, backendSessionId, accessExpiresAt: 100 }),
    },
    sessions: { ...unavailableAuth.sessions, read: async () => session },
  };
  const byToken = await authorizeSession({ accessToken: "fixture" }, auth);
  const byActor = await authorizeActorSession({ actor }, auth);
  expect(byToken.isOk()).toBe(true);
  expect(byActor.isOk()).toBe(true);
  if (byToken.isOk() && byActor.isOk()) {
    expect(byToken.get().username).toBe("updated");
    expect(byActor.get().username).toBe("original");
  }
});

test("actor authorization respects cancellation before reading session", async () => {
  const controller = new AbortController();
  controller.abort();
  let read = false;
  const auth = {
    ...unavailableAuth,
    sessions: {
      ...unavailableAuth.sessions,
      read: async () => {
        read = true;
        return session;
      },
    },
  };
  await expect(
    authorizeActorSession({ actor, signal: controller.signal }, auth),
  ).rejects.toThrow();
  expect(read).toBe(false);
});

for (const [current, expected] of [
  [null, AuthErrorCode.AccessTokenInvalid],
  [
    { ...session, user: { ...session.user, id: "other" as UserId } },
    AuthErrorCode.AccessTokenInvalid,
  ],
  [{ ...session, state: "revoked" as const }, AuthErrorCode.SessionRevoked],
] as const) {
  test(`token authorization returns ${expected} before reading the second clock`, async () => {
    let clockCalls = 0;
    const auth = {
      ...unavailableAuth,
      clock: () => {
        clockCalls += 1;
        if (clockCalls === 2) throw new Error("Clock unavailable");
        return 50;
      },
      tokens: {
        ...unavailableAuth.tokens,
        verifyAccess: async () =>
          Result.Ok({ userId, backendSessionId, accessExpiresAt: 100 }),
      },
      sessions: { ...unavailableAuth.sessions, read: async () => current },
    };

    const result = await authorizeSession({ accessToken: "fixture" }, auth);
    expect(result.isError()).toBe(true);
    if (result.isError()) expect(result.getError()).toBe(expected);
    expect(clockCalls).toBe(1);
  });
}
