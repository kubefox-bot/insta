import { expect, test } from "bun:test";
import { createJoseTokens } from "../../../apps/be-insta/src/domains/users/auth/adapters/jose/tokens";
import { createRegistrationCrypto } from "../../../apps/be-insta/src/domains/users/auth/adapters/registration/jose/crypto";
import type { UserId } from "../../../apps/be-insta/src/domains/users/domain/types";

const key = "aa".repeat(32);
const crypto = createRegistrationCrypto(key);
const now = 1900000000000;
test("setup proof cannot authorize API and access token cannot authorize setup", async () => {
  const auth = createJoseTokens({
    signingKey: key,
    replayKey: "bb".repeat(32),
  });
  const proof = await crypto.issueProof({
    userId: "0123456789abcdef01234567" as UserId,
    secret: crypto.secret(),
    now,
    expiresAt: now + 86400000,
  });
  expect((await crypto.verifyProof({ proof, now })).isOk()).toBe(true);
  expect((await auth.verifyAccess({ accessToken: proof, now })).isError()).toBe(
    true,
  );
  const accessToken = await auth.issueAccess({
    userId: "0123456789abcdef01234567",
    backendSessionId: globalThis.crypto.randomUUID(),
    now,
    accessExpiresAt: now + 900000,
  });
  expect(
    (await crypto.verifyProof({ proof: accessToken, now })).isError(),
  ).toBe(true);
  expect(
    (await crypto.verifyProof({ proof, now: now + 86400000 })).isError(),
  ).toBe(true);
});
test("OTP HMAC is challenge/version scoped and encrypted payload authenticates both email and code", async () => {
  const email = "synthetic@example.test";
  const code = "123456";
  const ciphertext = await crypto.sealMail({ email, code });
  expect(ciphertext.includes(email)).toBe(false);
  expect(ciphertext.includes(code)).toBe(false);
  expect(await crypto.openMail(ciphertext)).toEqual({ email, code });
  await expect(crypto.openMail(`${ciphertext}x`)).rejects.toThrow();
  const digest = crypto.codeDigest({ challengeId: "a", version: "1", code });
  expect(digest).not.toBe(
    crypto.codeDigest({ challengeId: "b", version: "1", code }),
  );
  expect(digest).not.toBe(
    crypto.codeDigest({ challengeId: "a", version: "2", code }),
  );
});

test("encrypted mail preserves the empty-code sentinel and rejects malformed OTP payloads", async () => {
  const email = "synthetic@example.test";
  expect(
    await crypto.openMail(await crypto.sealMail({ email, code: "" })),
  ).toEqual({
    email,
    code: "",
  });
  for (const code of ["12345", "1234567", "12345a", "１２３４５６", "123456\n"])
    await expect(
      crypto.openMail(await crypto.sealMail({ email, code })),
    ).rejects.toThrow();
});
