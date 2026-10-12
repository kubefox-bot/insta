import { EncryptJWT, jwtDecrypt } from "jose";
import { z } from "zod";
import {
  cookieAudience,
  cookieIssuer,
  jwePolicy,
  millisecondsPerSecond,
} from "./conts";

const cookieSchema = z.object({
  proof: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  exp: z.number().int(),
});
/**
 * Шифрует доказательство контекста согласия в JWE с назначением, издателем и сроком жизни в
 * секундах.
 */
export const encryptConsentCookie = async ({
  contextProof,
  expiresAt,
  key,
}: Readonly<{ contextProof: string; expiresAt: number; key: Uint8Array }>) =>
  new EncryptJWT({ proof: contextProof })
    .setProtectedHeader({ alg: jwePolicy.algorithm, enc: jwePolicy.encryption })
    .setIssuer(cookieIssuer)
    .setAudience(cookieAudience)
    .setExpirationTime(Math.floor(expiresAt / millisecondsPerSecond))
    .encrypt(key);
/**
 * Проверяет криптографию, назначение, срок и форму cookie; отсутствующее или недействительное
 * доказательство возвращает как undefined.
 */
export const decryptConsentCookie = async ({
  cookie,
  key,
}: Readonly<{ cookie?: string; key: Uint8Array }>): Promise<
  string | undefined
> => {
  if (!cookie) return undefined;
  try {
    const { payload } = await jwtDecrypt(cookie, key, {
      issuer: cookieIssuer,
      audience: cookieAudience,
      keyManagementAlgorithms: [jwePolicy.algorithm],
      contentEncryptionAlgorithms: [jwePolicy.encryption],
    });
    return cookieSchema.parse(payload).proof;
  } catch {
    return undefined;
  }
};
