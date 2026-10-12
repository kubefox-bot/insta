import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode } from "@insta/contracts/errors";

import {
  originalProjection,
  readOriginalReference,
} from "../../../../../lib/observability/analytics/index";
import { canonicalAuthEvent } from "../../../auth/business/canonical";
import { decideRevocation } from "../../../auth/domain/revocation";
import type { Sessions } from "../../../auth/ports/sessions";
import { collections } from "../conts";
import { usersTransaction } from "../transaction";
import type { MongoConnection, RotatingSessionDocument } from "../types";
/**
 * Транзакционно применяет доказательство отзыва и пишет logout в outbox только при новом
 * отзыве; повтор сохраняет исходный operationId.
 */
export const revokeSession = (
  connection: MongoConnection,
  input: Parameters<Sessions["revoke"]>[0],
): ReturnType<Sessions["revoke"]> => {
  const analyticsEventId = crypto.randomUUID();
  const reference = readOriginalReference(connection.analyticsReference);
  return usersTransaction({
    connection,
    /**
     * Различает неверное доказательство, прежний отзыв и истечение; только решение revoke
     * изменяет сессию и добавляет событие.
     */
    operation: async (session) => {
      const sessions = connection.apiDb.collection<RotatingSessionDocument>(
        collections.sessions,
      );
      const current = await sessions.findOne(
        { backendSessionId: input.backendSessionId },
        { session },
      );
      const now = connection.clock();
      if (!current)
        return Result.Error(AuthErrorCode.RevokeProofInvalid as const);
      const decision = decideRevocation({
        current: {
          ...current,
          userId: current.userId.toHexString(),
          expiresAt: current.expiresAt.getTime(),
          absoluteExpiresAt: current.absoluteExpiresAt.getTime(),
        },
        proof: input.proof,
        now,
      });
      if (decision.isError()) return Result.Error(decision.getError());
      if (decision.get() === "revoked")
        return Result.Ok({
          state: "revoked",
          operationId: current.revokeOperationId,
        });
      if (decision.get() === "expired") return Result.Ok({ state: "expired" });
      await sessions.updateOne(
        { _id: current._id, state: "active" },
        { $set: { state: "revoked", revokeOperationId: input.operationId } },
        { session },
      );
      await connection.apiDb.collection(collections.outbox).insertOne(
        {
          ...canonicalAuthEvent({
            kind: "logout",
            operationId: input.operationId,
            backendSessionId: input.backendSessionId,
            committedAt: now,
            analyticsEventId,
          }),
          ...originalProjection(reference),
          userId: current.userId,
        },
        { session },
      );
      return Result.Ok({ state: "revoked", operationId: input.operationId });
    },
  });
};
