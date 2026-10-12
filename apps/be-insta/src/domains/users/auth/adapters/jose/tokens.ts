import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { CompactEncrypt, compactDecrypt, SignJWT } from "jose";
import { replayEncryption, tokenPolicy } from "../../domain/conts";
import type { Tokens } from "../../ports/tokens";
import { verifyAccess } from "./verify";

/**
 * Связывает подпись access JWT и шифрование replay с отдельными ключами; предоставляет
 * криптографию без хранения сессий.
 */
export const createJoseTokens = ({
  signingKey,
  replayKey,
}: Readonly<{ signingKey: string; replayKey: string }>): Tokens => {
  const signing = Buffer.from(signingKey, "hex");
  const encryption = Buffer.from(replayKey, "hex");
  /**
   * Вычисляет SHA-256 секрета для сохранения и сравнения без записи открытого
   * refresh/revoke значения.
   */
  const digest = ({ secret }: Readonly<{ secret: string }>) =>
    createHash("sha256").update(secret).digest("hex");
  return {
    /**
     * Генерирует криптографически случайный base64url-секрет длины, заданной token
     * policy.
     */
    secret: () => randomBytes(tokenPolicy.secretBytes).toString("base64url"),
    digest,
    /**
     * Сравнивает digest предоставленного секрета с сохранённым через timingSafeEqual
     * после проверки одинаковой длины.
     */
    matches: ({ secret, digest: stored }) => {
      const expected = Buffer.from(stored, "hex");
      const supplied = Buffer.from(digest({ secret }), "hex");
      return (
        supplied.length === expected.length &&
        timingSafeEqual(supplied, expected)
      );
    },
    /**
     * Подписывает access JWT с назначением, issuer/audience и связью user/session;
     * миллисекунды сроков переводит в целые секунды JWT.
     */
    issueAccess: ({ userId, backendSessionId, now, accessExpiresAt }) =>
      new SignJWT({
        [tokenPolicy.useClaim]: tokenPolicy.use,
        sid: backendSessionId,
      })
        .setProtectedHeader({ alg: tokenPolicy.algorithm })
        .setIssuer(tokenPolicy.issuer)
        .setAudience(tokenPolicy.audience)
        .setSubject(userId)
        .setIssuedAt(Math.floor(now / tokenPolicy.millisecondsPerSecond))
        .setExpirationTime(
          Math.floor(accessExpiresAt / tokenPolicy.millisecondsPerSecond),
        )
        .sign(signing),
    /**
     * Проверяет access JWT ключом данного адаптера, сохраняя различие неверного и
     * истёкшего токена.
     */
    verifyAccess: (input) => verifyAccess({ ...input, signing }),
    /**
     * Шифрует строку replay через Compact JWE с разрешёнными алгоритмами; не записывает
     * результат в хранилище.
     */
    seal: ({ value }) =>
      new CompactEncrypt(new TextEncoder().encode(value))
        .setProtectedHeader({
          alg: replayEncryption.algorithm,
          enc: replayEncryption.encryption,
        })
        .encrypt(encryption),
    /**
     * Расшифровывает JWE только разрешёнными алгоритмами и строго декодирует UTF-8;
     * повреждение ciphertext или текста пробрасывается.
     */
    open: async ({ ciphertext }) => {
      const result = await compactDecrypt(ciphertext, encryption, {
        keyManagementAlgorithms: [replayEncryption.algorithm],
        contentEncryptionAlgorithms: [replayEncryption.encryption],
      });
      return new TextDecoder("utf-8", { fatal: true }).decode(result.plaintext);
    },
  };
};
