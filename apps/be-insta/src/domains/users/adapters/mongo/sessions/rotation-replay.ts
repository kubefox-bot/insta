import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode } from "@insta/contracts/errors";

import type { ClientSession, Db } from "mongodb";
import type { Sessions } from "../../../auth/ports/sessions";
import { collections } from "../conts";
import type { ReplayDocument, RotatingSessionDocument } from "../types";
/**
 * Возвращает зашифрованный результат прежнего refresh только при совпадении digest,
 * fingerprint, текущего поколения и живого срока; иначе отказывает.
 */
export const readRotationReplay = async ({
  db,
  current,
  input,
  session,
  now,
}: Readonly<{
  db: Db;
  current: RotatingSessionDocument;
  input: Parameters<Sessions["rotate"]>[0];
  session: ClientSession;
  now: number;
}>): ReturnType<Sessions["rotate"]> => {
  const replay = await db
    .collection<ReplayDocument>(collections.replays)
    .findOne(
      {
        owner: current.userId,
        operation: `refresh:${input.backendSessionId}`,
        keyDigest: input.keyDigest,
      },
      { session },
    );
  if (
    !replay ||
    replay.tokenDigest !== input.previousDigest ||
    replay.fingerprint !== input.fingerprint ||
    replay.generation !== current.generation ||
    replay.expiresAt.getTime() <= now
  )
    return Result.Error(AuthErrorCode.RefreshTokenInvalid as const);
  return Result.Ok({
    ciphertext: replay.ciphertext,
    operationId: replay.operationId,
  });
};
