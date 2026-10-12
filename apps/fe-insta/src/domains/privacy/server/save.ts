import {
  consentPayloadBytes,
  saveChoiceSchema,
} from "@insta/contracts/privacy";
import { acceptsCookieMutation } from "../../../lib/http/server/index";
import { consentCookieName, consentSaveStatus } from "./conts";
import { decryptConsentCookie, encryptConsentCookie } from "./cookie";
import { projectPreference } from "./projection";
import type { CookieJar, ServerPreferences } from "./types";
/**
 * Проверяет origin, JSON и размер запроса согласия, сохраняет выбор по cookie-доказательству и
 * обновляет защищённую cookie; сбой сохранения или шифрования возвращает save_failed.
 */
export const savePreference = async ({
  request,
  origin,
  cookies,
  key,
  preferences,
}: Readonly<{
  request: Request;
  origin: string;
  cookies: CookieJar;
  key: Uint8Array;
  preferences: ServerPreferences;
}>) => {
  if (
    !acceptsCookieMutation({ request, origin }) ||
    request.headers.get("content-type")?.split(";")[0] !== "application/json"
  )
    return new Response(null, { status: consentSaveStatus.forbidden });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > consentPayloadBytes)
    return new Response(null, { status: consentSaveStatus.oversized });
  const parsed = await Promise.resolve()
    .then(() => JSON.parse(text))
    .catch(() => undefined);
  const input = saveChoiceSchema.safeParse(parsed);
  if (!input.success)
    return new Response(null, { status: consentSaveStatus.invalid });
  const proof = await decryptConsentCookie({
    cookie: cookies.get(consentCookieName),
    key,
  });
  try {
    const saved = await preferences.save(input.data, proof);
    const cookie = await encryptConsentCookie({
      contextProof: saved.contextProof,
      expiresAt: saved.expiresAt,
      key,
    });
    cookies.set(consentCookieName, cookie, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      expires: new Date(saved.expiresAt),
    });
    return Response.json(projectPreference(saved.state), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { code: "save_failed" },
      {
        status: consentSaveStatus.unavailable,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
};
