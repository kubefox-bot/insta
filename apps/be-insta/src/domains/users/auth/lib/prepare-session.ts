import { durations } from "../../domain/conts";
import type { UserId } from "../../domain/types";
import { sessionExpiry } from "../domain/session";
import type { AuthDependencies } from "../ports/dependencies";
/**
 * Готовит новые credentials, подпись access и digest для persistence по одному снимку
 * времени; создание данных ещё не означает сохранение сессии.
 */
export const prepareSession = async ({
  user,
  auth,
}: Readonly<{
  user: Readonly<{ id: UserId; username: string }>;
  auth: AuthDependencies;
}>) => {
  const now = auth.clock();
  const absoluteExpiresAt = now + durations.absoluteSessionMs;
  const expiry = sessionExpiry({ now, absoluteExpiresAt });
  const backendSessionId = auth.sessionId();
  const refreshToken = `${backendSessionId}.${auth.tokens.secret()}`;
  const revokeSecret = auth.tokens.secret();
  return {
    now,
    credentials: {
      user,
      backendSessionId,
      refreshToken,
      revokeSecret,
      absoluteExpiresAt,
      ...expiry,
      accessToken: await auth.tokens.issueAccess({
        userId: user.id,
        backendSessionId,
        now,
        accessExpiresAt: expiry.accessExpiresAt,
      }),
    },
    session: {
      backendSessionId,
      refreshDigest: auth.tokens.digest({ secret: refreshToken }),
      revokeDigest: auth.tokens.digest({ secret: revokeSecret }),
      issuedAt: now,
      expiresAt: expiry.expiresAt,
      absoluteExpiresAt,
    },
  };
};
