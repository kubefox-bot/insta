import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode } from "@insta/contracts/errors";
import { unavailableAuth } from "../../../src/app/composition/users/unavailable";
import { createSupportActor } from "../../../src/domains/support-reports/server/index";
import type { SessionId, UserId } from "../../../src/domains/users/index";

const userId = "000000000000000000000001" as UserId;
const backendSessionId = "fixture-session" as SessionId;
const current = {
  backendSessionId,
  user: { id: userId, username: "alice" },
  refreshDigest: "refresh",
  revokeDigest: "revoke",
  generation: 0,
  state: "active" as const,
  issuedAt: 0,
  expiresAt: 200,
  absoluteExpiresAt: 300,
};

test("Support maps valid Users authorization to the actor identifier", async () => {
  const actor = createSupportActor({
    ...unavailableAuth,
    clock: () => 50,
    tokens: {
      ...unavailableAuth.tokens,
      verifyAccess: async () =>
        Result.Ok({ userId, backendSessionId, accessExpiresAt: 100 }),
    },
    sessions: { ...unavailableAuth.sessions, read: async () => current },
  });
  const result = await actor("fixture");
  expect(result.isOk()).toBe(true);
  if (result.isOk()) expect(result.get()).toBe(userId);
});

test("Support masks rejected and thrown Users authorization", async () => {
  for (const verifyAccess of [
    async () => Result.Error(AuthErrorCode.AccessTokenInvalid as const),
    async (): Promise<never> => {
      throw new Error("Users unavailable");
    },
  ]) {
    const actor = createSupportActor({
      ...unavailableAuth,
      clock: () => 50,
      tokens: { ...unavailableAuth.tokens, verifyAccess },
    });
    const result = await actor("fixture");
    expect(result.isError()).toBe(true);
    if (result.isError())
      expect(String(result.getError())).toBe("SUPPORT_IDENTITY_UNAVAILABLE");
  }
});
