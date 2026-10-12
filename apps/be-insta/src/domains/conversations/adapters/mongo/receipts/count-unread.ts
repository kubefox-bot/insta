import type { ClientSession, Db } from "mongodb";
import { z } from "zod";
import { collections } from "../conts";
import { receiptCollections } from "./conts";

const countsSchema = z.array(
  z.strictObject({
    _id: z.string(),
    count: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }),
);

/**
 * В snapshot вызывающего считает чужие сообщения без числового readAt для actor по
 * заданным беседам; валидирует safe integer counts, пустой список не обращается к Mongo.
 */
export const countUnread = async ({
  db,
  session,
  ids,
  actorId,
}: Readonly<{
  db: Db;
  session: ClientSession;
  ids: readonly string[];
  actorId: string;
}>) => {
  const messages = db.collection(collections.messages);
  const receipts = db.collection(receiptCollections.receipts);
  const rows = ids.length
    ? await messages
        .aggregate(
          [
            {
              $match: {
                conversationId: { $in: [...ids] },
                senderId: { $ne: actorId },
              },
            },
            {
              $lookup: {
                from: receipts.collectionName,
                let: { messageId: { $toString: "$_id" } },
                pipeline: [
                  {
                    $match: {
                      recipientId: actorId,
                      $expr: { $eq: ["$messageId", "$$messageId"] },
                    },
                  },
                  { $project: { _id: 0, readAt: 1 } },
                ],
                as: "receipts",
              },
            },
            {
              $match: {
                "receipts.readAt": { $not: { $type: "number" } },
              },
            },
            { $group: { _id: "$conversationId", count: { $sum: 1 } } },
          ],
          { session },
        )
        .toArray()
    : [];
  return countsSchema.parse(rows);
};
