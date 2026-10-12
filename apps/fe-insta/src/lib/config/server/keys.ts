import { hkdfSync } from "node:crypto";
import {
  privacyKeyBytes,
  privacyKeyPurpose,
  sessionKeyBytes,
  sessionKeyPurposes,
} from "../conts";
/**
 * Получает раздельные ключи privacy, cookie, credentials и revoke из проверенного root
 * key через HKDF. Разделение purpose предотвращает использование одного производного
 * ключа для разных протоколов.
 */
export const deriveWebKeys = (rootKey: string) => {
  /**
   * Выводит ключ заданной длины с purpose в HKDF info и пустой salt. Ожидает уже
   * проверенный hex root key; не читает окружение.
   */
  const derive = ({
    purpose,
    bytes,
  }: Readonly<{ purpose: string; bytes: number }>) =>
    new Uint8Array(
      hkdfSync(
        "sha256",
        Buffer.from(rootKey, "hex"),
        new Uint8Array(),
        purpose,
        bytes,
      ),
    );
  return {
    privacyEncryptionKey: derive({
      purpose: privacyKeyPurpose,
      bytes: privacyKeyBytes,
    }),
    sessionKeys: {
      cookieKey: derive({
        purpose: sessionKeyPurposes.cookieKey,
        bytes: sessionKeyBytes,
      }),
      credentialsKey: derive({
        purpose: sessionKeyPurposes.credentialsKey,
        bytes: sessionKeyBytes,
      }),
      revokeKey: derive({
        purpose: sessionKeyPurposes.revokeKey,
        bytes: sessionKeyBytes,
      }),
    },
  };
};
