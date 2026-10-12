import { ObjectId } from "mongodb";
import { conversationPolicy } from "../../../domain/policy";
import type { CommitMessageOutcome } from "../../../ports/commit-message";
import { collections } from "../conts";
import type { ConversationDocument } from "../types";
import { persistMessage } from "./persist";
import { readMessageIdentity } from "./replay";
import type { MessageTransaction } from "./types";
/**
 * В заимствованной транзакции проверяет беседу и membership, затем replay; новый message
 * получает следующий sequence, исчерпание счётчика вызывает ошибку.
 */
export const commitWithinTransaction = async (
  input: MessageTransaction,
): Promise<CommitMessageOutcome> => {
  const conversation = await input.db
    .collection<ConversationDocument>(collections.conversations)
    .findOne(
      { _id: new ObjectId(input.input.conversationId) },
      { session: input.session },
    );
  if (!conversation) return { kind: "missing" };
  if (!conversation.participantIds.includes(input.input.actorId))
    return { kind: "forbidden" };
  if (input.input.keyDigest !== undefined) {
    const replay = await readMessageIdentity(input);
    if (replay) return replay;
  }
  if (conversation.lastSequence >= conversationPolicy.maxSequence)
    throw new Error("Message sequence exhausted");
  const message = await persistMessage({
    ...input,
    sequence: conversation.lastSequence + 1,
    participantIds: conversation.participantIds,
  });
  return { kind: "committed", message };
};
