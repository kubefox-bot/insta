import { Result } from "@bloodyowl/boxed";
import { readOriginalReference } from "../../../../lib/observability/analytics/index";
import { validUsername } from "../../domain/policy";
import { validInitialSession } from "../../domain/session";
import type { AuthPersistence } from "../../ports/auth-persistence";
import { persistIssuance } from "./activation/issuance";
import { findActivationReplay } from "./activation/replay";
import { activateUser } from "./activation/transition";
import { mongoUserId } from "./mapper";
import { authTransaction } from "./transaction";
import type { MongoConnection } from "./types";
/**
 * Связывает активацию с Mongo: проверяет учётные данные и атомарно активирует
 * пользователя, выдаёт сессию и записывает replay/outbox.
 */
export const activationOperation =
  (connection: MongoConnection): AuthPersistence["activateAndIssueSession"] =>
  async (input) => {
    const analyticsEventId = crypto.randomUUID();
    const reference = readOriginalReference(connection.analyticsReference);
    if (!validUsername(input.username) || !input.passwordHash)
      return Result.Error("conflict");
    const userId = mongoUserId(input.userId);
    return authTransaction({
      connection,
      /**
       * Сначала восстанавливает допустимый replay; иначе проверяет сроки и выполняет
       * активацию с выдачей в переданной транзакции.
       */
      operation: async (session) => {
        const now = Math.max(input.now, connection.clock());
        const dependencies = {
          db: connection.apiDb,
          input: { ...input, now },
          userId,
          session,
        };
        const replay = await findActivationReplay(dependencies);
        if (replay) return replay;
        if (
          !validInitialSession({ session: input.session, now: input.now }) ||
          input.session.expiresAt <= now
        )
          return Result.Error("invalidSession");
        const activated = await activateUser(dependencies);
        if (activated.isError()) return Result.Error(activated.getError());
        await persistIssuance({
          ...dependencies,
          analyticsEventId,
          reference,
          proofExpiresAt: activated.get().expiresAt,
        });
        return Result.Ok({
          state: "activated",
          user: {
            id: input.userId,
            status: "active",
            username: input.username,
          },
          backendSessionId: input.session.backendSessionId,
        });
      },
    });
  };
