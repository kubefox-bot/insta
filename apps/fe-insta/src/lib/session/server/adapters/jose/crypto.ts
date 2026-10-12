import { EncryptJWT, jwtDecrypt } from "jose";
import { z } from "zod";
import { jwePolicy } from "../../conts";
import type { SessionCrypto } from "../../ports/crypto";

const credentialsSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});
const secretSchema = z.object({ secret: z.string().min(1) });
/** Связывает JWE-операции с отдельными заимствованными ключами credentials и отзыва. Расшифровка проверяет форму payload; ошибки криптографии и схем передаются вызывающему коду. */
export const createSessionCrypto = ({
  credentialsKey,
  revokeKey,
}: Readonly<{
  credentialsKey: Uint8Array;
  revokeKey: Uint8Array;
}>): SessionCrypto => ({
  /** Шифрует копию access/refresh credentials ключом credentials; исходный объект не изменяется. */
  sealCredentials: (credentials) =>
    new EncryptJWT({ ...credentials })
      .setProtectedHeader({
        alg: jwePolicy.algorithm,
        enc: jwePolicy.encryption,
      })
      .encrypt(credentialsKey),
  /** Расшифровывает credentials разрешёнными алгоритмами и требует непустые access/refresh tokens; ошибки остаются отклонением Promise. */
  openCredentials: async (ciphertext) =>
    credentialsSchema.parse(
      (
        await jwtDecrypt(ciphertext, credentialsKey, {
          keyManagementAlgorithms: [jwePolicy.algorithm],
          contentEncryptionAlgorithms: [jwePolicy.encryption],
        })
      ).payload,
    ),
  /** Шифрует revoke secret отдельным ключом, чтобы его хранение не зависело от ротации access/refresh credentials. */
  sealRevokeSecret: (secret) =>
    new EncryptJWT({ secret })
      .setProtectedHeader({
        alg: jwePolicy.algorithm,
        enc: jwePolicy.encryption,
      })
      .encrypt(revokeKey),
  /** Расшифровывает revoke secret отдельным ключом и валидирует непустую строку; не подменяет повреждённый payload отсутствием секрета. */
  openRevokeSecret: async (ciphertext) =>
    secretSchema.parse(
      (
        await jwtDecrypt(ciphertext, revokeKey, {
          keyManagementAlgorithms: [jwePolicy.algorithm],
          contentEncryptionAlgorithms: [jwePolicy.encryption],
        })
      ).payload,
    ).secret,
});
