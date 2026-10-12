import { Result } from "@bloodyowl/boxed";
import { ConversationSuccessCode } from "@insta/contracts/errors";
import { type Collection, MongoServerError } from "mongodb";
import { duplicateKeyCode } from "./conts";
import { mapConversation } from "./mapper";
import type { ConversationDocument } from "./types";
/**
 * После duplicate key ищет уже созданную пару и возвращает reused; отсутствие
 * подтверждённой пары либо другая ошибка пробрасывают исходный отказ.
 */
export const recoverPairRace = async ({
  error,
  conversations,
  pairKey,
}: Readonly<{
  error: unknown;
  conversations: Collection<ConversationDocument>;
  pairKey: string;
}>) => {
  if (!(error instanceof MongoServerError && error.code === duplicateKeyCode))
    throw error;
  const committed = await conversations.findOne({ pairKey });
  if (!committed) throw error;
  return Result.Ok({
    conversation: mapConversation(committed),
    code: ConversationSuccessCode.ConversationReused as const,
  });
};
