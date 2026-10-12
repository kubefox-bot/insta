import type { ConsentReference } from "@insta/fe-core/observability/analytics";
import { type ClientSession, type Db, ObjectId } from "mongodb";
import { originalProjection } from "../../../../../lib/observability/analytics/index";
import { canonicalAuthEvent } from "../../../auth/business/canonical";
import { durations } from "../../../domain/conts";
import type { Activation } from "../../../domain/types";
import { collections, replayOperation } from "../conts";
import type { ReplayDocument, SessionDocument } from "../types";
/**
 * Записывает первую сессию, ограниченный сроками replay и событие регистрации в
 * транзакции вызывающего; commit и освобождение session принадлежат вызывающему.
 */
export const persistIssuance = async ({
  db,
  input,
  userId,
  proofExpiresAt,
  session,
  analyticsEventId,
  reference,
}: Readonly<{
  db: Db;
  input: Activation;
  userId: ObjectId;
  proofExpiresAt: Date;
  session: ClientSession;
  analyticsEventId: string;
  reference?: ConsentReference | undefined;
}>) => {
  const initial = input.session;
  await db.collection<SessionDocument>(collections.sessions).insertOne(
    {
      _id: new ObjectId(),
      userId,
      backendSessionId: initial.backendSessionId,
      refreshDigest: initial.refreshDigest,
      revokeDigest: initial.revokeDigest,
      generation: 0,
      state: "active",
      issuedAt: new Date(initial.issuedAt),
      expiresAt: new Date(initial.expiresAt),
      absoluteExpiresAt: new Date(initial.absoluteExpiresAt),
    },
    { session },
  );
  if (input.replay)
    await db.collection<ReplayDocument>(collections.replays).insertOne(
      {
        _id: new ObjectId(),
        owner: userId,
        operation: replayOperation,
        ...input.replay,
        tokenDigest: input.tokenDigest,
        operationId: input.operationId,
        backendSessionId: initial.backendSessionId,
        generation: 0,
        expiresAt: new Date(
          Math.min(
            input.now + durations.replayMs,
            proofExpiresAt.getTime(),
            initial.expiresAt,
            initial.absoluteExpiresAt,
          ),
        ),
      },
      { session },
    );
  await db.collection(collections.outbox).insertOne(
    {
      ...canonicalAuthEvent({
        kind: "registration",
        operationId: input.operationId,
        backendSessionId: initial.backendSessionId,
        committedAt: input.now,
        analyticsEventId,
      }),
      ...originalProjection(reference),
      userId,
      backendSessionId: initial.backendSessionId,
      committedAt: new Date(input.now),
    },
    { session },
  );
};
