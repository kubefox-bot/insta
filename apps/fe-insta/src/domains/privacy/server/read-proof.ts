import { consentCookieName } from "./conts";
import { decryptConsentCookie } from "./cookie";
import type { CookieJar } from "./types";
/**
 * Извлекает cookie согласия из запроса и передаёт её криптографическому валидатору; не создаёт
 * новое доказательство.
 */
export const readConsentProof = ({
  cookies,
  key,
}: Readonly<{ cookies: CookieJar; key: Uint8Array }>) =>
  decryptConsentCookie({ cookie: cookies.get(consentCookieName), key });
