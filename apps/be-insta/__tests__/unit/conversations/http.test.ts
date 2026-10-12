import { expect, test } from "bun:test";
import { createApplication } from "../../../src/app/bootstrap";
import { unavailableAuth } from "../../../src/app/composition/users/index";
import type { SessionId, UserId } from "../../../src/domains/users/index";
import { createJoseTokens } from "../../../src/domains/users/server/index";

test("verified HTTP requests reject rounded raw sequences and incompatible initial limits", async () => {
  const now = Date.now();
  const userId = "000000000000000000000001" as UserId;
  const backendSessionId = crypto.randomUUID() as SessionId;
  const tokens = createJoseTokens({
    signingKey: "ab".repeat(32),
    replayKey: "cd".repeat(32),
  });
  const accessToken = await tokens.issueAccess({
    userId,
    backendSessionId,
    now,
    accessExpiresAt: now + 10000,
  });
  const unused = (): never => {
    throw new Error("Unused HTTP fixture dependency");
  };
  const auth = {
    ...unavailableAuth,
    clock: () => now,
    tokens,
    sessions: {
      ...unavailableAuth.sessions,
      read: async () => ({
        backendSessionId,
        user: { id: userId, username: "fixture" },
        refreshDigest: "fixture",
        revokeDigest: "fixture",
        generation: 0,
        state: "active" as const,
        issuedAt: now,
        expiresAt: now + 10000,
        absoluteExpiresAt: now + 10000,
      }),
    },
  };
  const app = await createApplication(
    {
      users: {
        auth,
        limits: unavailableAuth.limits,
        passwords: unavailableAuth.passwords,
        persistence: {
          createPending: unused,
          replaceProof: unused,
          activateAndIssueSession: unused,
        },
      },
      checkRequired: async () => true,
      check: async () => ({ ready: true, mail: "ok", delivery: "ok" }),
      close: async () => {},
    },
    { mode: "offline" },
  );
  try {
    await app.listen(0, "127.0.0.1");
    const url = await app.getUrl();
    for (const query of [
      "after=9007199254740991.1",
      "after=1.0000000000000001",
      "after=9007199254740992",
      "limit=10",
      "limit=100",
    ]) {
      const response = await fetch(
        `${url}/v1/conversations/${userId}/messages?${query}`,
        { headers: { authorization: `Bearer ${accessToken}` } },
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
    }
    for (const query of ["limit=0", "limit=51", "limit=1.5", "unknown=1"]) {
      const response = await fetch(`${url}/v1/conversations/unread?${query}`, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(response.status).toBe(400);
    }
  } finally {
    await app.close();
  }
});

test("directory and conversation reads require a verified actor", async () => {
  const app = await createApplication(
    {
      checkRequired: async () => true,
      check: async () => ({ ready: true, mail: "ok", delivery: "ok" }),
      close: async () => {},
    },
    { mode: "offline" },
  );
  try {
    await app.listen(0, "127.0.0.1");
    const url = await app.getUrl();
    for (const [path, method] of [
      ["conversations", "GET"],
      ["auth/logout", "POST"],
    ] as const) {
      const retired = await fetch(`${url}/v1/${path}`, { method });
      expect(retired.status).toBe(404);
      await retired.body?.cancel();
    }
    for (const path of [
      "users?q=a",
      "conversations/unread",
      "conversations/000000000000000000000000/messages",
    ]) {
      const response = await fetch(`${url}/v1/${path}`);
      expect(response.status).toBe(401);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect((await response.json()).error.code).toBe("ACCESS_TOKEN_INVALID");
    }
  } finally {
    await app.close();
  }
});
