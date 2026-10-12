import { expect, test } from "bun:test";
import { SignJWT } from "jose";
import { createSupportProof } from "../../../apps/be-insta/src/domains/support-reports/adapters/jose/proof";

test("support proof rejects future issued-at and non UUID context claims", async () => {
  const key = "ab".repeat(32);
  const now = 1000000;
  for (const [subject, issuedAt] of [
    [crypto.randomUUID(), 2000],
    ["not-a-context", 1000],
  ] as const) {
    const token = await new SignJWT(
      Object.fromEntries([["token_use", "support_form"]]),
    )
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("insta")
      .setAudience("support-form")
      .setSubject(subject)
      .setIssuedAt(issuedAt)
      .setExpirationTime(3000)
      .sign(Buffer.from(key, "hex"));
    expect(
      (await createSupportProof(key).verify({ proof: token, now })).isError(),
    ).toBe(true);
  }
});
