import { EncryptJWT, jwtDecrypt } from "jose";
import { z } from "zod";
import {
  cookieAudience,
  cookieIssuer,
  jwePolicy,
  millisecondsPerSecond,
} from "../../conts";

const bindingSchema = z.object({ bindingId: z.uuid(), exp: z.number().int() });
/** Шифрует cookie только с bindingId и ограничивает её абсолютным сроком с округлением до секунд. Токены backend в cookie не помещаются; ключ предоставляется конфигурацией. */
export const encryptSessionCookie = ({
  bindingId,
  absoluteExpiresAt,
  key,
}: Readonly<{
  bindingId: string;
  absoluteExpiresAt: number;
  key: Uint8Array;
}>) =>
  new EncryptJWT({ bindingId })
    .setProtectedHeader({ alg: jwePolicy.algorithm, enc: jwePolicy.encryption })
    .setIssuer(cookieIssuer)
    .setAudience(cookieAudience)
    .setExpirationTime(Math.floor(absoluteExpiresAt / millisecondsPerSecond))
    .encrypt(key);
/** Проверяет JWE algorithms, issuer, audience, срок по переданным часам и форму payload. Отсутствующая, просроченная или неприемлемая cookie даёт undefined; хранилище сессий здесь не читается. */
export const decryptSessionCookie = async ({
  cookie,
  key,
  now,
}: Readonly<{ cookie?: string; key: Uint8Array; now: number }>): Promise<
  string | undefined
> => {
  if (!cookie) return undefined;
  try {
    const { payload } = await jwtDecrypt(cookie, key, {
      issuer: cookieIssuer,
      audience: cookieAudience,
      keyManagementAlgorithms: [jwePolicy.algorithm],
      contentEncryptionAlgorithms: [jwePolicy.encryption],
      currentDate: new Date(now),
    });
    return bindingSchema.parse(payload).bindingId;
  } catch {
    return undefined;
  }
};
