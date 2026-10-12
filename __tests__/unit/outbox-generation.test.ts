import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { createOutboxSender } from "../../apps/fe-insta/src/domains/conversations/browser/outbox/adapters/sender";
import { sendRequest } from "../../apps/fe-insta/src/domains/conversations/server/send";
import { encryptSessionCookie } from "../../apps/fe-insta/src/lib/session/server/adapters/jose/cookie";
import type { SessionDependencies } from "../../apps/fe-insta/src/lib/session/server/ports/dependencies";

test("reconciled G1 queued send crossing successful G2 cookie cannot reach native effect until explicit confirmation", async () => {
  const now = Date.now();
  const key = new Uint8Array(32).fill(1);
  const userId = "a".repeat(24);
  const cookie = await encryptSessionCookie({
    bindingId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    key,
    absoluteExpiresAt: now + 60000,
  });
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected session mutation");
  };
  const sessions: SessionDependencies = {
    clock: () => now,
    id: crypto.randomUUID,
    wait: unexpected,
    store: {
      read: async () => ({
        bindingId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        user: { id: userId, username: "alice" },
        backendSessionId: "g2",
        credentials: "cipher",
        revokeSecret: "cipher",
        accessExpiresAt: now + 60000,
        expiresAt: now + 60000,
        absoluteExpiresAt: now + 60000,
        revision: 0,
        blocked: false,
      }),
      create: unexpected,
      beginRefresh: unexpected,
      takeOver: unexpected,
      finishRefresh: unexpected,
      block: unexpected,
      expire: unexpected,
      beginRevocation: unexpected,
      pendingRevocations: unexpected,
      finishRevocation: unexpected,
    },
    backend: {
      authorize: async () => Result.Ok({ userId, username: "alice" }),
      refresh: unexpected,
      revoke: unexpected,
    },
    crypto: {
      openCredentials: async () => ({
        accessToken: "G2-access",
        refreshToken: "G2-refresh",
      }),
      sealCredentials: unexpected,
      sealRevokeSecret: unexpected,
      openRevokeSecret: unexpected,
    },
  };
  const effects: string[] = [];
  let limited = false;
  const captured = {
    ownerId: userId,
    conversationId: "b".repeat(24),
    text: "owned draft",
    key: "immutable-key",
    clientMessageId: "immutable-client",
    operationId: crypto.randomUUID(),
    createdAt: now,
    attempts: 1,
    nextAttemptAt: now,
    lastAuthGeneration: "g1",
    revision: 0,
    manualAttempt: false,
    state: "queued",
    needsConfirmation: false,
  } as const;
  const sender = createOutboxSender({
    request: async (url, init) =>
      sendRequest(
        {
          request: new Request(`https://localhost${url}`, {
            ...init,
            headers: { ...init?.headers, origin: "https://localhost" },
          }),
          origin: "https://localhost",
          cookies: { get: () => cookie },
          conversationId: captured.conversationId,
        },
        {
          context: {},
          cookieKey: key,
          sessions,
          backend: async (input) => {
            if (limited)
              return Result.Error({
                code: "MESSAGES_RATE_LIMITED",
                status: 429,
                retryAfter: "30",
              });
            effects.push(input.key ?? "missing");
            return Result.Ok({
              id: "c".repeat(24),
              authorId: userId,
              conversationId: captured.conversationId,
              text: captured.text,
              clientMessageId: captured.clientMessageId,
              sequence: 1,
              createdAt: new Date(now).toISOString(),
            });
          },
        },
      ),
  });
  expect(await sender(captured)).toEqual({ kind: "auth" });
  expect(effects).toEqual([]);
  expect(
    (
      await sender({
        ...captured,
        lastAuthGeneration: "g2",
        manualAttempt: true,
      })
    ).kind,
  ).toBe("confirmed");
  expect(effects).toEqual(["immutable-key"]);
  limited = true;
  expect(await sender({ ...captured, lastAuthGeneration: "g2" })).toEqual({
    kind: "retry",
    retryAfterMs: 30000,
  });
});
