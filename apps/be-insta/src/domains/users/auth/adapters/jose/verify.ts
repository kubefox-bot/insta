import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode } from "@insta/contracts/errors";

import { compactVerify } from "jose";
import { z } from "zod";
import type { SessionId, UserId } from "../../../domain/types";
import { tokenPolicy } from "../../domain/conts";
import type { Tokens } from "../../ports/tokens";

const accessSchema = z.object({
  iss: z.literal(tokenPolicy.issuer),
  aud: z.literal(tokenPolicy.audience),
  [tokenPolicy.useClaim]: z.literal(tokenPolicy.use),
  sub: z.string().regex(/^[a-f0-9]{24}$/),
  sid: z.uuid(),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
});
/**
 * Сначала проверяет подпись и назначение/claims, затем классифицирует истечение; неверная
 * структура или криптографическая ошибка даёт AccessTokenInvalid.
 */
export const verifyAccess = async ({
  accessToken,
  now,
  signing,
}: Readonly<{
  accessToken: string;
  now: number;
  signing: Uint8Array;
}>): ReturnType<Tokens["verifyAccess"]> => {
  try {
    // Verify cryptography first, then all purposes/claims before classifying expiry.
    const verified = await compactVerify(accessToken, signing, {
      algorithms: [tokenPolicy.algorithm],
    });
    const claims = accessSchema.safeParse(
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(verified.payload),
      ),
    );
    if (
      !claims.success ||
      claims.data.iat > Math.floor(now / tokenPolicy.millisecondsPerSecond) ||
      claims.data.exp <= claims.data.iat
    )
      return Result.Error(AuthErrorCode.AccessTokenInvalid as const);
    if (claims.data.exp * tokenPolicy.millisecondsPerSecond <= now)
      return Result.Error(AuthErrorCode.AccessTokenExpired as const);
    return Result.Ok({
      userId: claims.data.sub as UserId,
      backendSessionId: claims.data.sid as SessionId,
      accessExpiresAt: claims.data.exp * tokenPolicy.millisecondsPerSecond,
    });
  } catch {
    return Result.Error(AuthErrorCode.AccessTokenInvalid as const);
  }
};
