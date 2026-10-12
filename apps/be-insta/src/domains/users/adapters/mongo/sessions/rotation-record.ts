import type { ObjectId } from "mongodb";
import type { Sessions } from "../../../auth/ports/sessions";
import { durations } from "../../../domain/conts";
import type { ReplayDocument, RotatingSessionDocument } from "../types";
/**
 * Строит replay следующего поколения refresh; срок ограничивает окном replay, новым
 * refresh deadline и абсолютным сроком сессии.
 */
export const rotationRecord = ({
  current,
  input,
  replayId,
  now,
}: Readonly<{
  current: RotatingSessionDocument;
  input: Parameters<Sessions["rotate"]>[0];
  replayId: ObjectId;
  now: number;
}>): ReplayDocument => ({
  _id: replayId,
  owner: current.userId,
  operation: `refresh:${input.backendSessionId}`,
  keyDigest: input.keyDigest,
  tokenDigest: input.previousDigest,
  fingerprint: input.fingerprint,
  ciphertext: input.ciphertext,
  operationId: input.operationId,
  backendSessionId: input.backendSessionId,
  generation: current.generation + 1,
  expiresAt: new Date(
    Math.min(
      now + durations.replayMs,
      input.expiresAt,
      current.absoluteExpiresAt.getTime(),
    ),
  ),
});
