import { expect, test } from "bun:test";
import { SignJWT } from "jose";
import { reportSchema } from "../../../apps/be-insta/src/domains/support-reports/adapters/http/report.dto";
import { createSupportProof } from "../../../apps/be-insta/src/domains/support-reports/adapters/jose/proof";
import { createJoseTokens } from "../../../apps/be-insta/src/domains/users/auth/adapters/jose/tokens";

const key = "ab".repeat(32);
test("support proof is bounded to issuer audience use signature expiry and never an access token", async () => {
  const proof = createSupportProof(key);
  const now = Date.now();
  const signed = await proof.issue({
    contextId: crypto.randomUUID(),
    now,
    expiresAt: now + 86400000,
  });
  expect((await proof.verify({ proof: signed, now })).isOk()).toBe(true);
  expect(
    (await proof.verify({ proof: signed, now: now + 86400000 })).isError(),
  ).toBe(true);
  expect(
    (
      await createSupportProof("cd".repeat(32)).verify({ proof: signed, now })
    ).isError(),
  ).toBe(true);
  expect(
    (
      await createJoseTokens({ signingKey: key, replayKey: key }).verifyAccess({
        accessToken: signed,
        now,
      })
    ).isError(),
  ).toBe(true);
  for (const [iss, aud, use] of [
    ["other", "support-form", "support_form"],
    ["insta", "other", "support_form"],
    ["insta", "support-form", "access"],
  ]) {
    const token = await new SignJWT(Object.fromEntries([["token_use", use]]))
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(iss)
      .setAudience(aud)
      .setSubject("context")
      .setIssuedAt(Math.floor(now / 1000))
      .setExpirationTime(Math.floor(now / 1000) + 100)
      .sign(Buffer.from(key, "hex"));
    expect((await proof.verify({ proof: token, now })).isError()).toBe(true);
  }
});
test("support comment limit counts Unicode scalar values and forbids header code injection", () => {
  expect(
    reportSchema.safeParse({
      comment: "😀".repeat(4000),
      errorCode: "TECHNICAL_PROBLEM",
    }).success,
  ).toBe(true);
  expect(
    reportSchema.safeParse({
      comment: "😀".repeat(4001),
      errorCode: "TECHNICAL_PROBLEM",
    }).success,
  ).toBe(false);
  expect(
    reportSchema.safeParse({
      comment: "\ud800",
      errorCode: "TECHNICAL_PROBLEM",
    }).success,
  ).toBe(false);
  expect(
    reportSchema.safeParse({
      comment: "ok",
      errorCode: "CODE\r\nBcc:attack@insta.test",
    }).success,
  ).toBe(false);
});
