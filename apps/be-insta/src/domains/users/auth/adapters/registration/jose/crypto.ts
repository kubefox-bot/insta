import { createHmac, randomInt } from "node:crypto";
import { Result } from "@bloodyowl/boxed";
import { RegistrationErrorCode } from "@insta/contracts/errors";
import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import type { UserId } from "../../../../domain/types";
import { tokenPolicy } from "../../../domain/conts";
import { otpPolicy } from "../../../domain/registration/conts";
import type { RegistrationCrypto } from "../../../ports/registration/crypto";
import { createJoseTokens } from "../../jose/tokens";
import { registrationCryptoPolicy as policy } from "./conts";

const mailSchema = z.strictObject({
  email: z.email(),
  code: z.string().regex(new RegExp(`^(?:[0-9]{${otpPolicy.digits}})?$`)),
});
const proofSchema = z.object({
  sub: z.string().regex(/^[a-f0-9]{24}$/),
  jti: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  exp: z.number().int(),
  iat: z.number().int(),
  [tokenPolicy.useClaim]: z.literal(policy.use),
});
/**
 * Разделяет производные ключи OTP, proof и mail по назначению; собирает генерацию кодов,
 * шифрование письма и проверку registration JWT.
 */
export const createRegistrationCrypto = (key: string): RegistrationCrypto => {
  /** Выводит отдельный HMAC-ключ для заданного назначения из корневого registration key. */
  const derive = (purpose: string) =>
    createHmac("sha256", Buffer.from(key, "hex")).update(purpose).digest("hex");
  /**
   * Вычисляет непрозрачный digest значения с ключом отдельного назначения, не смешивая
   * контексты OTP и fingerprint.
   */
  const hmac = (purpose: string, value: string) =>
    createHmac("sha256", Buffer.from(derive(purpose), "hex"))
      .update(value)
      .digest("hex");
  const signingKey = derive(policy.proofContext);
  const tokens = createJoseTokens({
    signingKey,
    replayKey: derive(policy.mailContext),
  });
  const codeMaximum = 10 ** otpPolicy.digits;
  return {
    secret: tokens.secret,
    /** Получает устойчивую непрозрачную identity challenge из email в OTP-контексте. */
    challengeId: (email) =>
      hmac(policy.otpContext, JSON.stringify(["identity", email])),
    /** Генерирует случайный десятичный OTP установленной длины, сохраняя ведущие нули. */
    code: () => String(randomInt(codeMaximum)).padStart(otpPolicy.digits, "0"),
    /** Формирует registration fingerprint через выделенный HMAC-контекст. */
    digest: (value) => hmac(policy.fingerprintContext, value),
    /**
     * Связывает OTP с конкретными challengeId и версией, чтобы одинаковый код другой
     * версии имел иной digest.
     */
    codeDigest: ({ challengeId, version, code }) =>
      hmac(policy.otpContext, JSON.stringify([challengeId, version, code])),
    /**
     * Сериализует и шифрует payload письма отдельным mail-ключом перед помещением в
     * очередь.
     */
    sealMail: (input) => tokens.seal({ value: JSON.stringify(input) }),
    /**
     * Расшифровывает письмо и валидирует JSON схемой mail; повреждённые данные вызывают
     * ошибку.
     */
    openMail: async (ciphertext) =>
      mailSchema.parse(JSON.parse(await tokens.open({ ciphertext }))),
    /**
     * Подписывает registration proof с userId, одноразовым secret и сроком, отдельным
     * audience и назначением.
     */
    issueProof: ({ userId, secret, expiresAt, now }) =>
      new SignJWT({ [tokenPolicy.useClaim]: policy.use })
        .setProtectedHeader({ alg: tokenPolicy.algorithm })
        .setIssuer(tokenPolicy.issuer)
        .setAudience(policy.audience)
        .setSubject(userId)
        .setJti(secret)
        .setIssuedAt(Math.floor(now / tokenPolicy.millisecondsPerSecond))
        .setExpirationTime(
          Math.floor(expiresAt / tokenPolicy.millisecondsPerSecond),
        )
        .sign(Buffer.from(signingKey, "hex")),
    /**
     * Проверяет подпись, audience, назначение и срок proof по переданным часам; любой
     * отказ преобразует в RegistrationProofInvalid.
     */
    verifyProof: async ({ proof, now }) => {
      try {
        const verified = await jwtVerify(
          proof,
          Buffer.from(signingKey, "hex"),
          {
            algorithms: [tokenPolicy.algorithm],
            issuer: tokenPolicy.issuer,
            audience: policy.audience,
            currentDate: new Date(now),
          },
        );
        const claims = proofSchema.parse(verified.payload);
        return Result.Ok({
          userId: claims.sub as UserId,
          secret: claims.jti,
          expiresAt: claims.exp * tokenPolicy.millisecondsPerSecond,
        });
      } catch {
        return Result.Error(RegistrationErrorCode.RegistrationProofInvalid);
      }
    },
  };
};
