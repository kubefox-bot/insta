import { type Db, ObjectId } from "mongodb";
import type { Membership } from "../../ports/realtime";
import { collections } from "./conts";
import type { ConversationDocument } from "./types";
/** Собирает отменяемую проверку участия в беседе на заимствованном Db. */
export const createMongoMembership = (db: Db): Membership => ({
  /**
   * Проверяет наличие пары conversation/actor; неверный ObjectId даёт false, signal
   * передаётся Mongo, ошибки чтения пробрасываются.
   */
  permits: async ({ actorId, conversationId, signal }) => {
    if (!ObjectId.isValid(conversationId)) return false;
    const conversation = await db
      .collection<ConversationDocument>(collections.conversations)
      .findOne(
        { _id: new ObjectId(conversationId), participantIds: actorId },
        { projection: { _id: 1 }, signal },
      );
    return conversation !== null;
  },
});
