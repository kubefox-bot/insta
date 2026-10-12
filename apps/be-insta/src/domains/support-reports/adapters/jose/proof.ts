import { Result } from "@bloodyowl/boxed";
import { SupportErrorCode } from "@insta/contracts/errors";
import { jwtVerify, SignJWT } from "jose";
import { supportPolicy } from "../../domain/conts";
import type { Proof } from "../../ports/proof";
import { supportClaimsSchema } from "./claims";
/**
 * Подготавливает ключ подписи гостевого контекста формы; issuer, audience и алгоритм
 * задаёт политика support.
 */
export const createSupportProof = (signingKey: string): Proof => {
  const key = Buffer.from(signingKey, "hex");
  return {
    /**
     * Подписывает отдельный JWT формы с context id и сроком в секундах; токен не является
     * пользовательской сессией.
     */
    issue: ({ contextId, now, expiresAt }) =>
      new SignJWT({ [supportPolicy.tokenUseClaim]: supportPolicy.tokenUse })
        .setProtectedHeader({ alg: supportPolicy.algorithm })
        .setIssuer(supportPolicy.issuer)
        .setAudience(supportPolicy.audience)
        .setSubject(contextId)
        .setIssuedAt(Math.floor(now / supportPolicy.millisecondsPerSecond))
        .setExpirationTime(
          Math.floor(expiresAt / supportPolicy.millisecondsPerSecond),
        )
        .sign(key),
    /**
     * Проверяет подпись, назначение, сроки и максимальную длительность proof; любой
     * неверный токен возвращает support context invalid.
     */
    verify: async ({ proof, now }) => {
      try {
        const { payload } = await jwtVerify(proof, key, {
          issuer: supportPolicy.issuer,
          audience: supportPolicy.audience,
          algorithms: [supportPolicy.algorithm],
          currentDate: new Date(now),
        });
        const claims = supportClaimsSchema.parse(payload);
        if (
          claims.iat > Math.floor(now / supportPolicy.millisecondsPerSecond) ||
          claims.exp <= claims.iat ||
          claims.exp - claims.iat >
            supportPolicy.contextMs / supportPolicy.millisecondsPerSecond
        )
          return Result.Error(SupportErrorCode.SupportContextInvalid);
        return Result.Ok(claims.sub);
      } catch {
        return Result.Error(SupportErrorCode.SupportContextInvalid);
      }
    },
  };
};
