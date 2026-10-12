import type { Cookies } from "@sveltejs/kit";
import { EncryptJWT, jwtDecrypt } from "jose";
import { z } from "zod";
import { intentLifetimeMs } from "../domain/conts";
import {
  contextAudience,
  contextCookieName,
  jwePolicy,
  millisecondsPerSecond,
} from "./conts";
/**
 * Расшифровывает и проверяет audience, срок и UUID browser-контекста; отсутствующая или
 * недействительная cookie даёт undefined.
 */
export const readContinuationContext = async ({
  cookies,
  key,
  now,
}: Readonly<{ cookies: Cookies; key: Uint8Array; now: number }>) => {
  const cookie = cookies.get(contextCookieName);
  if (!cookie) return undefined;
  try {
    const { payload } = await jwtDecrypt(cookie, key, {
      audience: contextAudience,
      keyManagementAlgorithms: [jwePolicy.algorithm],
      contentEncryptionAlgorithms: [jwePolicy.encryption],
      currentDate: new Date(now),
    });
    return z.object({ context: z.uuid() }).parse(payload).context;
  } catch {
    return undefined;
  }
};
/**
 * Переиспользует действующий browser-контекст либо создаёт UUID и HttpOnly cookie со сроком
 * intent; существующую cookie не продлевает.
 */
export const ensureContinuationContext = async ({
  cookies,
  key,
  now,
  origin,
}: Readonly<{
  cookies: Cookies;
  key: Uint8Array;
  now: number;
  origin: string;
}>) => {
  const current = await readContinuationContext({ cookies, key, now });
  if (current) return current;
  const context = crypto.randomUUID();
  const expiresAt = now + intentLifetimeMs;
  cookies.set(
    contextCookieName,
    await new EncryptJWT({ context })
      .setProtectedHeader({
        alg: jwePolicy.algorithm,
        enc: jwePolicy.encryption,
      })
      .setAudience(contextAudience)
      .setExpirationTime(Math.floor(expiresAt / millisecondsPerSecond))
      .encrypt(key),
    {
      path: "/",
      httpOnly: true,
      secure: new URL(origin).protocol === "https:",
      sameSite: "lax",
      expires: new Date(expiresAt),
    },
  );
  return context;
};
