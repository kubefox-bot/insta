import { Result } from "@bloodyowl/boxed";
import type { ClientSession, Db, ObjectId } from "mongodb";
import type {
  Activation,
  ActivationResult,
  PersistenceError,
} from "../../../domain/types";
import { collections, replayOperation } from "../conts";
import type { ReplayDocument, SessionDocument } from "../types";
/**
 * Ищет повтор активации по владельцу и ключу: отсутствие допускает новую операцию,
 * несовпадение запроса или устаревшая сессия возвращают отказ.
 */
export const findActivationReplay = async ({
  db,
  input,
  userId,
  session,
}: Readonly<{
  db: Db;
  input: Activation;
  userId: ObjectId;
  session: ClientSession;
}>): Promise<Result<ActivationResult, PersistenceError> | undefined> => {
  if (!input.replay) return undefined;
  const replay = await db
    .collection<ReplayDocument>(collections.replays)
    .findOne(
      {
        owner: userId,
        operation: replayOperation,
        keyDigest: input.replay.keyDigest,
      },
      { session },
    );
  if (!replay) return undefined;
  if (
    replay.tokenDigest !== input.tokenDigest ||
    replay.fingerprint !== input.replay.fingerprint
  )
    return Result.Error("conflict");
  const current = await db
    .collection<SessionDocument>(collections.sessions)
    .findOne(
      { backendSessionId: replay.backendSessionId, userId },
      { session },
    );
  if (current?.state !== "active") return Result.Error("invalidProof");
  if (
    replay.expiresAt.getTime() <= input.now ||
    current.generation !== replay.generation ||
    current.expiresAt.getTime() <= input.now ||
    current.absoluteExpiresAt.getTime() <= input.now
  )
    return Result.Error("invalidProof");
  return Result.Ok({
    state: "replayed",
    ciphertext: replay.ciphertext,
    operationId: replay.operationId,
  });
};
