import { expect, test } from "bun:test";
import { SignJWT } from "jose";
import { createJoseTokens } from "../../../apps/be-insta/src/domains/users/auth/adapters/jose/tokens";
import { tokenPolicy } from "../../../apps/be-insta/src/domains/users/auth/domain/conts";
import { decideRevocation } from "../../../apps/be-insta/src/domains/users/auth/domain/revocation";
import { sessionExpiry } from "../../../apps/be-insta/src/domains/users/auth/domain/session";
import type { RevocationState } from "../../../apps/be-insta/src/domains/users/auth/domain/types";
import type { UserId } from "../../../apps/be-insta/src/domains/users/domain/types";

const signingKey = "ab".repeat(32);
const replayKey = "cd".repeat(32);
const now = 1900000000000;
const tokens = createJoseTokens({ signingKey, replayKey });

test("revocation checks secret proof before terminal state and preserves expiry boundaries", () => {
  const current = {
    userId: "0123456789abcdef01234567" as UserId,
    revokeDigest: "digest",
    state: "active",
    expiresAt: now + 100,
    absoluteExpiresAt: now + 200,
  } as const satisfies RevocationState;
  const secret = { kind: "secret", digest: "digest" } as const;
  for (const state of ["active", "revoked", "expired"] as const) {
    const input = { ...current, state };
    expect(
      decideRevocation({
        current: input,
        proof: { ...secret, digest: "different" },
        now,
      }).toJSON(),
    ).toMatchObject({ tag: "Error", error: "REVOKE_PROOF_INVALID" });
    expect(
      decideRevocation({ current: input, proof: secret, now }).toJSON(),
    ).toMatchObject({
      tag: "Ok",
      value: state === "active" ? "revoke" : state,
    });
  }
  for (const expired of [
    { ...current, expiresAt: now },
    { ...current, absoluteExpiresAt: now },
  ])
    expect(
      decideRevocation({ current: expired, proof: secret, now }).toJSON(),
    ).toMatchObject({ tag: "Ok", value: "expired" });
});

test("session sliding expiry and access are capped at absolute lifetime", () => {
  expect(sessionExpiry({ now, absoluteExpiresAt: now + 10000 })).toEqual({
    expiresAt: now + 10000,
    accessExpiresAt: now + 10000,
  });
  expect(sessionExpiry({ now, absoluteExpiresAt: now + 2592000000 })).toEqual({
    expiresAt: now + 604800000,
    accessExpiresAt: now + 900000,
  });
});
test("JWT pins signature issuer audience purpose and required claims; expired valid token is distinct", async () => {
  const claims = {
    userId: "0123456789abcdef01234567",
    backendSessionId: crypto.randomUUID(),
    now,
    accessExpiresAt: now + 10000,
  };
  const accessToken = await tokens.issueAccess(claims);
  expect((await tokens.verifyAccess({ accessToken, now })).isOk()).toBe(true);
  expect(
    (await tokens.verifyAccess({ accessToken, now: now + 10000 })).toJSON(),
  ).toMatchObject({ tag: "Error", error: "ACCESS_TOKEN_EXPIRED" });
  for (const patch of [
    { aud: "other" },
    { iss: "other" },
    { [tokenPolicy.useClaim]: "registration" },
    { sid: undefined },
    { sub: undefined },
    { exp: undefined },
  ]) {
    const forged = await new SignJWT({
      iss: "insta-api",
      aud: "insta-api",
      sub: claims.userId,
      sid: claims.backendSessionId,
      [tokenPolicy.useClaim]: "access",
      iat: now / 1000,
      exp: (now + 10000) / 1000,
      ...patch,
    })
      .setProtectedHeader({ alg: "HS256" })
      .sign(Buffer.from(signingKey, "hex"));
    expect(
      (
        await tokens.verifyAccess({ accessToken: forged, now: now + 20000 })
      ).toJSON(),
    ).toMatchObject({ tag: "Error", error: "ACCESS_TOKEN_INVALID" });
  }
  expect(
    (
      await createJoseTokens({
        signingKey: "ee".repeat(32),
        replayKey,
      }).verifyAccess({ accessToken, now })
    ).toJSON(),
  ).toMatchObject({ tag: "Error", error: "ACCESS_TOKEN_INVALID" });
});
test("encrypted replay authenticates contents and secret comparison is scoped and exact", async () => {
  const encrypted = await tokens.seal({ value: "private-result" });
  expect(await tokens.open({ ciphertext: encrypted })).toBe("private-result");
  expect(encrypted).not.toContain("private-result");
  await expect(tokens.open({ ciphertext: `${encrypted}x` })).rejects.toThrow();
  expect(
    tokens.matches({ secret: "a", digest: tokens.digest({ secret: "a" }) }),
  ).toBe(true);
  expect(
    tokens.matches({ secret: "b", digest: tokens.digest({ secret: "a" }) }),
  ).toBe(false);
});

test("same prior generation key with a different fingerprint is reuse; unknown secrets are generic", async () => {
  const { decideRotation } = await import(
    "../../../apps/be-insta/src/domains/users/auth/domain/rotation"
  );
  const current = {
    refreshDigest: "current",
    generation: 1,
    state: "active" as const,
    expiresAt: now + 604800000,
    absoluteExpiresAt: now + 2592000000,
    previousRefresh: [
      { digest: "old", keyDigest: "same-key", fingerprint: "original" },
    ],
  };
  const input = {
    previousDigest: "old",
    keyDigest: "same-key",
    fingerprint: "changed",
    generation: 1,
    expiresAt: now + 604800000,
    accessExpiresAt: now + 900000,
  };
  expect(decideRotation({ current, input, now }).toJSON()).toMatchObject({
    tag: "Ok",
    value: { state: "revoke" },
  });
  const unknown = decideRotation({
    current,
    input: { ...input, previousDigest: "unrecognized" },
    now,
  });
  expect(String(unknown.isError() && unknown.getError())).toBe(
    "REFRESH_TOKEN_INVALID",
  );
});
