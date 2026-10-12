import { collections } from "../../../../apps/be-insta/src/domains/conversations/adapters/mongo/conts";
import { receiptCollections } from "../../../../apps/be-insta/src/domains/conversations/adapters/mongo/receipts/conts";
import { findOwnedConversation } from "../../analytics/lib/owned-conversation";
import type { CanonicalFixtureInput } from "../../analytics/types";

export const readOwnedMarks = async (input: CanonicalFixtureInput) => {
  const conversationId = await findOwnedConversation(input);
  if (!conversationId) return new Response(null, { status: 403 });
  const [conversation, messages, receipts, events] = await Promise.all([
    input.db.collection(collections.conversations).findOne(
      {
        participantIds: input.actorId,
        $expr: { $eq: [{ $toString: "$_id" }, conversationId] },
      },
      { projection: { lastActivityAt: 1, lastSequence: 1 } },
    ),
    input.db
      .collection(collections.messages)
      .find({ conversationId })
      .sort({ sequence: 1 })
      .toArray(),
    input.db
      .collection(receiptCollections.receipts)
      .find({ conversationId })
      .sort({ sequence: 1 })
      .toArray(),
    input.db
      .collection(receiptCollections.outbox)
      .find({ conversationId })
      .toArray(),
  ]);
  return Response.json({ conversation, messages, receipts, events });
};
