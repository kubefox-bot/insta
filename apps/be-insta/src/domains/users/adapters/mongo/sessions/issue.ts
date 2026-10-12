import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode } from "@insta/contracts/errors";

import { ObjectId } from "mongodb";
import {
  originalProjection,
  readOriginalReference,
} from "../../../../../lib/observability/analytics/index";
import { canonicalAuthEvent } from "../../../auth/business/canonical";
import type { Sessions } from "../../../auth/ports/sessions";
import { validInitialSession } from "../../../domain/session";
import { collections } from "../conts";
import { mongoUserId } from "../mapper";
import { usersTransaction } from "../transaction";
import type { MongoConnection, SessionDocument, UserDocument } from "../types";
/**
 * Выдаёт активному пользователю начальную сессию и атомарное событие login;
 * идентификаторы выделяются один раз перед возможными повторами транзакции.
 */
export const issueSession = async (
  connection: MongoConnection,
  input: Parameters<Sessions["issue"]>[0],
): ReturnType<Sessions["issue"]> => {
  const id = new ObjectId();
  const analyticsEventId = crypto.randomUUID();
  const reference = readOriginalReference(connection.analyticsReference);
  const userId = mongoUserId(input.userId);
  return usersTransaction({
    connection,
    /**
     * Проверяет сроки начальной сессии и active-пользователя, затем сохраняет сессию и
     * outbox в одной переданной транзакции.
     */
    operation: async (session) => {
      const now = connection.clock();
      const initial = input.session;
      if (
        !validInitialSession({ session: initial, now: initial.issuedAt }) ||
        initial.expiresAt <= now
      )
        return Result.Error(AuthErrorCode.AuthConflict as const);
      const user = await connection.apiDb
        .collection<UserDocument>(collections.users)
        .findOne({ _id: userId, status: "active" }, { session });
      if (!user) return Result.Error(AuthErrorCode.InvalidCredentials as const);
      await connection.apiDb
        .collection<SessionDocument>(collections.sessions)
        .insertOne(
          {
            _id: id,
            userId,
            backendSessionId: initial.backendSessionId,
            refreshDigest: initial.refreshDigest,
            revokeDigest: initial.revokeDigest,
            state: "active",
            generation: 0,
            issuedAt: new Date(initial.issuedAt),
            expiresAt: new Date(initial.expiresAt),
            absoluteExpiresAt: new Date(initial.absoluteExpiresAt),
          },
          { session },
        );
      await connection.apiDb.collection(collections.outbox).insertOne(
        {
          ...canonicalAuthEvent({
            kind: "login",
            operationId: input.operationId,
            backendSessionId: initial.backendSessionId,
            committedAt: now,
            analyticsEventId,
          }),
          ...originalProjection(reference),
          userId,
        },
        { session },
      );
      return Result.Ok({
        operationId: input.operationId,
      });
    },
  });
};
