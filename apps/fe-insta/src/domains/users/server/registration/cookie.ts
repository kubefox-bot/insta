import { EncryptJWT, jwtDecrypt } from "jose";
import { z } from "zod";
import {
  jwePolicy,
  millisecondsPerSecond,
  registrationCookieAudience,
  registrationCookieName,
} from "./conts";

const stateSchema = z.discriminatedUnion("stage", [
  z.object({
    stage: z.literal("verify"),
    challengeId: z.string(),
    email: z.email(),
    expiresAt: z.number(),
  }),
  z.object({
    stage: z.literal("setup"),
    proof: z.string(),
    expiresAt: z.number(),
    operationId: z.uuid(),
    key: z.uuid(),
  }),
]);
/**
 * Шифрует этап регистрации с аудиторией и сроком JWE, сохраняя proof и ключи completion только
 * внутри cookie.
 */
export const encryptRegistration = ({
  state,
  key,
}: Readonly<{ state: z.infer<typeof stateSchema>; key: Uint8Array }>) =>
  new EncryptJWT(state)
    .setProtectedHeader({ alg: jwePolicy.algorithm, enc: jwePolicy.encryption })
    .setAudience(registrationCookieAudience)
    .setExpirationTime(Math.floor(state.expiresAt / millisecondsPerSecond))
    .encrypt(key);
/**
 * Проверяет криптографию, аудиторию, этап и срок относительно переданных часов; отсутствующее
 * или недействительное состояние возвращает как undefined.
 */
export const readRegistration = async ({
  cookie,
  key,
  now,
}: Readonly<{ cookie?: string; key: Uint8Array; now: number }>) => {
  if (!cookie) return undefined;
  try {
    const { payload } = await jwtDecrypt(cookie, key, {
      audience: registrationCookieAudience,
      keyManagementAlgorithms: [jwePolicy.algorithm],
      contentEncryptionAlgorithms: [jwePolicy.encryption],
      currentDate: new Date(now),
    });
    const state = stateSchema.parse(payload);
    return state.expiresAt > now ? state : undefined;
  } catch {
    return undefined;
  }
};
/**
 * Показывает странице только этап и срок регистрации, скрывая challenge, proof и ключи; без
 * действительного состояния выбирает start.
 */
export const projectRegistration = async (
  input: Parameters<typeof readRegistration>[0],
) => {
  const state = await readRegistration(input);
  return state
    ? { stage: state.stage, expiresAt: state.expiresAt }
    : { stage: "start" as const };
};
/**
 * Записывает зашифрованное состояние регистрации в HttpOnly SameSite cookie со сроком этапа и
 * Secure для HTTPS-origin.
 */
export const writeRegistration = async ({
  state,
  key,
  cookies,
  origin,
}: Parameters<typeof encryptRegistration>[0] &
  Readonly<{ cookies: import("@sveltejs/kit").Cookies; origin: string }>) =>
  cookies.set(
    registrationCookieName,
    await encryptRegistration({ state, key }),
    {
      path: "/",
      httpOnly: true,
      secure: new URL(origin).protocol === "https:",
      sameSite: "lax",
      expires: new Date(state.expiresAt),
    },
  );
