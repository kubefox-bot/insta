import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode } from "@insta/contracts/errors";

import { ObjectId } from "mongodb";
import { decideRotation } from "../../../auth/domain/rotation";
import type { Sessions } from "../../../auth/ports/sessions";
import { collections } from "../conts";
import { usersTransaction } from "../transaction";
import type { MongoConnection, RotatingSessionDocument } from "../types";
import { commitRotation } from "./commit-rotation";
import { readRotationReplay } from "./rotation-replay";
/**
 * Выполняет refresh атомарно: новый запрос ротирует сессию, допустимый повтор читает
 * replay, подозрительный повтор сохраняет отзыв.
 */
export const rotateSession = async (
  connection: MongoConnection,
  input: Parameters<Sessions["rotate"]>[0],
): ReturnType<Sessions["rotate"]> => {
  const replayId = new ObjectId();
  const analyticsEventId = crypto.randomUUID();
  return usersTransaction({
    connection,
    /**
     * Читает каноническую сессию и применяет решение ротации; ветка revoke записывает
     * revoked и возвращает ожидаемый отказ без исключения.
     */
    operation: async (session) => {
      const db = connection.apiDb;
      const sessions = db.collection<RotatingSessionDocument>(
        collections.sessions,
      );
      const current = await sessions.findOne(
        { backendSessionId: input.backendSessionId },
        { session },
      );
      const now = connection.clock();
      if (!current || current.userId.toHexString() !== input.userId)
        return Result.Error(AuthErrorCode.RefreshTokenInvalid as const);
      const decision = decideRotation({
        current: {
          ...current,
          previousRefresh: current.previousRefresh ?? [],
          expiresAt: current.expiresAt.getTime(),
          absoluteExpiresAt: current.absoluteExpiresAt.getTime(),
        },
        input,
        now,
      });
      if (decision.isError()) return Result.Error(decision.getError());
      const context = { db, current, input, session, now };
      switch (decision.get().state) {
        case "revoke":
          await sessions.updateOne(
            { _id: current._id },
            { $set: { state: "revoked" } },
            { session },
          );
          return Result.Error(AuthErrorCode.SessionRevoked as const);
        case "replay":
          return readRotationReplay(context);
        case "rotate":
          return commitRotation({ ...context, replayId, analyticsEventId });
      }
    },
  });
};
