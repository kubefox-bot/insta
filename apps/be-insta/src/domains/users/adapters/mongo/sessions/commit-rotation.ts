import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode } from "@insta/contracts/errors";

import type { ClientSession, Db, ObjectId } from "mongodb";
import { canonicalAuthEvent } from "../../../auth/business/canonical";
import type { Sessions } from "../../../auth/ports/sessions";
import { collections } from "../conts";
import type { ReplayDocument, RotatingSessionDocument } from "../types";
import { rotationRecord } from "./rotation-record";
/**
 * В транзакции вызывающего заменяет refresh digest, сохраняет историю, replay и событие
 * refresh; занятый idempotency key возвращает конфликт.
 */
export const commitRotation = async ({
  db,
  current,
  input,
  session,
  replayId,
  now,
  analyticsEventId,
}: Readonly<{
  db: Db;
  current: RotatingSessionDocument;
  input: Parameters<Sessions["rotate"]>[0];
  session: ClientSession;
  replayId: ObjectId;
  now: number;
  analyticsEventId: string;
}>): ReturnType<Sessions["rotate"]> => {
  const operation = `refresh:${input.backendSessionId}`;
  const replays = db.collection<ReplayDocument>(collections.replays);
  if (
    await replays.findOne(
      { owner: current.userId, operation, keyDigest: input.keyDigest },
      { session },
    )
  )
    return Result.Error(AuthErrorCode.AuthConflict as const);
  const generation = current.generation + 1;
  await db.collection<RotatingSessionDocument>(collections.sessions).updateOne(
    { _id: current._id, generation: current.generation },
    {
      $set: {
        refreshDigest: input.nextDigest,
        generation,
        expiresAt: new Date(input.expiresAt),
      },
      $push: {
        previousRefresh: {
          digest: input.previousDigest,
          keyDigest: input.keyDigest,
          fingerprint: input.fingerprint,
          generation: current.generation,
        },
      },
    },
    { session },
  );
  await replays.insertOne(rotationRecord({ current, input, replayId, now }), {
    session,
  });

  await db.collection(collections.outbox).insertOne(
    {
      ...canonicalAuthEvent({
        kind: "refresh",
        operationId: input.operationId,
        backendSessionId: input.backendSessionId,
        committedAt: now,
        analyticsEventId,
      }),
      userId: current.userId,
    },
    { session },
  );
  return Result.Ok({
    ciphertext: input.ciphertext,
    operationId: input.operationId,
  });
};
