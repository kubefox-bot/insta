import { expect, test } from "bun:test";
import { jwtDecrypt } from "jose";
import {
  decryptSessionCookie,
  encryptSessionCookie,
} from "../../../apps/fe-insta/src/lib/session/server/adapters/jose/cookie";
import { createSessionCrypto } from "../../../apps/fe-insta/src/lib/session/server/adapters/jose/crypto";

test("cookie contains only opaque binding claims and stops exactly at its fixed absolute expiry", async () => {
  const key = new Uint8Array(32).fill(1);
  const bindingId = crypto.randomUUID();
  const cookie = await encryptSessionCookie({
    bindingId,
    absoluteExpiresAt: 2000,
    key,
  });
  expect(await decryptSessionCookie({ cookie, key, now: 1999 })).toBe(
    bindingId,
  );
  expect(
    await decryptSessionCookie({ cookie, key, now: 2000 }),
  ).toBeUndefined();
  expect(
    await decryptSessionCookie({
      cookie,
      key: new Uint8Array(32).fill(2),
      now: 1999,
    }),
  ).toBeUndefined();
  const payload = (
    await jwtDecrypt(cookie, key, { currentDate: new Date(1999) })
  ).payload;
  expect(Object.keys(payload).sort()).toEqual([
    "aud",
    "bindingId",
    "exp",
    "iss",
  ]);
});
test("database ciphertext separates rotating credentials and retained revocation proof by key purpose", async () => {
  const crypto = createSessionCrypto({
    credentialsKey: new Uint8Array(32).fill(2),
    revokeKey: new Uint8Array(32).fill(3),
  });
  const credentials = {
    accessToken: "synthetic-access-token",
    refreshToken: "synthetic-refresh-token",
  };
  const sealed = await crypto.sealCredentials(credentials);
  const revoke = await crypto.sealRevokeSecret("synthetic-revoke-secret");
  expect(sealed).not.toContain(credentials.accessToken);
  expect(sealed).not.toContain(credentials.refreshToken);
  expect(revoke).not.toContain("synthetic-revoke-secret");
  expect(await crypto.openCredentials(sealed)).toEqual(credentials);
  expect(await crypto.openRevokeSecret(revoke)).toBe("synthetic-revoke-secret");
  await expect(crypto.openCredentials(revoke)).rejects.toThrow();
  await expect(crypto.openRevokeSecret(sealed)).rejects.toThrow();
});
