import { type ClientSession, type Db, ObjectId } from "mongodb";
import type {
  CommitMessageInput,
  CommitMessageOutcome,
} from "../../../ports/commit-message";
import { collections } from "../conts";
import { mapMessage } from "../mapper";
import type { MessageDocument, MessageIdentityDocument } from "../types";
/**
 * Ищет persisted эффект по actor/key либо заранее выделенному message id; вне транзакции
 * использует majority read, fingerprint mismatch даёт conflict, identity без сообщения —
 * ошибку.
 */
export const readMessageIdentity = async ({
  db,
  input,
  messageId,
  session,
}: Readonly<{
  db: Db;
  input: CommitMessageInput;
  messageId: ObjectId;
  session?: ClientSession;
}>): Promise<CommitMessageOutcome | null> => {
  const selector =
    input.keyDigest === undefined
      ? { _id: messageId.toHexString() }
      : { actorId: input.actorId, keyDigest: input.keyDigest };
  const options =
    session === undefined
      ? { readConcern: { level: "majority" as const } }
      : { session };
  const identity = await db
    .collection<MessageIdentityDocument>(collections.identities)
    .findOne(selector, options);
  if (!identity) return null;
  if (identity.fingerprint !== input.fingerprint) return { kind: "conflict" };
  const message = await db
    .collection<MessageDocument>(collections.messages)
    .findOne({ _id: new ObjectId(identity.messageId) }, options);
  if (!message) throw new Error("Message identity has no persisted effect");
  return { kind: "replayed", message: mapMessage(message) };
};
