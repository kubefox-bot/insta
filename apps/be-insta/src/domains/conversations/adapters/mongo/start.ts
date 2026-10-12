import { Result } from "@bloodyowl/boxed";
import { ConversationSuccessCode } from "@insta/contracts/errors";
import type { ConsentReference } from "@insta/fe-core/observability/analytics";
import { type ClientSession, type Db, ObjectId } from "mongodb";
import {
  originalProjection,
  readOriginalReference,
} from "../../../../lib/observability/analytics/index";
import { conversationCreated } from "../../business/conts";
import { pairKey } from "../../domain/membership";
import type { Conversations } from "../../ports/conversations";
import { collections, transactionOptions } from "./conts";
import { mapConversation } from "./mapper";
import { recoverPairRace } from "./race";
import type { ConversationDocument } from "./types";
/**
 * Создаёт либо переиспользует уникальную пару участников; новую беседу и событие
 * сохраняет атомарно, duplicate race восстанавливает чтением пары, собственную session
 * закрывает.
 */
export const createStartPair =
  ({
    db,
    startSession,
    clock,
    analyticsReference,
  }: Readonly<{
    db: Db;
    startSession: () => ClientSession;
    clock: () => number;
    analyticsReference?: () => ConsentReference | undefined;
  }>): Conversations["startPair"] =>
  async ({ participantIds, operationId }) => {
    const key = pairKey(participantIds);
    const conversations = db.collection<ConversationDocument>(
      collections.conversations,
    );
    const existing = await conversations.findOne({ pairKey: key });
    if (existing)
      return Result.Ok({
        conversation: mapConversation(existing),
        code: ConversationSuccessCode.ConversationReused,
      });
    const now = new Date(clock());
    const document: ConversationDocument = {
      _id: new ObjectId(),
      participantIds: [...participantIds].sort() as [string, string],
      pairKey: key,
      lastSequence: 0,
      lastActivityAt: now,
      createdAt: now,
    };
    const session = startSession();
    const analyticsEventId = crypto.randomUUID();
    const reference = readOriginalReference(analyticsReference);
    try {
      await session.withTransaction(async () => {
        await conversations.insertOne(document, { session });
        await db.collection(collections.events).insertOne(
          {
            conversationId: document._id.toHexString(),
            ...conversationCreated,
            operationId,
            createdAt: now,
            analyticsEventId,
            effectId: document._id.toHexString(),
            occurredAt: now.getTime(),
            ...originalProjection(reference),
          },
          { session },
        );
      }, transactionOptions);
      return Result.Ok({
        conversation: mapConversation(document),
        code: ConversationSuccessCode.ConversationCreated,
      });
    } catch (error) {
      return await recoverPairRace({ error, conversations, pairKey: key });
    } finally {
      await session.endSession();
    }
  };
