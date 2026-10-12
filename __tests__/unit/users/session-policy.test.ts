import { expect, test } from "bun:test";
import { validInitialSession } from "../../../apps/be-insta/src/domains/users/domain/session";
import { createSessionId } from "../../../apps/be-insta/src/domains/users/server/index";

test("initial session uses immutable30days cap and refresh at most7days", () => {
  const now = 1800000000000;
  const session = {
    backendSessionId: createSessionId(),
    refreshDigest: "a".repeat(64),
    revokeDigest: "b".repeat(64),
    issuedAt: now,
    expiresAt: now + 604800000,
    absoluteExpiresAt: now + 2592000000,
  };
  expect(validInitialSession({ session, now })).toBe(true);
  expect(
    validInitialSession({ session: { ...session, expiresAt: now + 1 }, now }),
  ).toBe(true);
  for (const invalid of [
    { ...session, expiresAt: now },
    { ...session, expiresAt: now + 604800001 },
    { ...session, absoluteExpiresAt: now + 2592000001 },
    { ...session, issuedAt: now + 1 },
  ])
    expect(validInitialSession({ session: invalid, now })).toBe(false);
});
