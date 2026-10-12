import { necessaryPreference } from "../domain/decision";
import { projectPreference } from "./projection";
import { readConsentProof } from "./read-proof";
import type { CookieJar, ServerPreferences } from "./types";
/**
 * Читает предпочтение по защищённой cookie и оставляет только публичные поля; недоступность
 * backend переводит ответ в необходимый режим без выбора.
 */
export const loadPreference = async ({
  cookies,
  key,
  preferences,
}: Readonly<{
  cookies: CookieJar;
  key: Uint8Array;
  preferences: ServerPreferences;
}>) => {
  const proof = await readConsentProof({ cookies, key });
  try {
    return projectPreference(await preferences.read(proof));
  } catch {
    return necessaryPreference();
  }
};
