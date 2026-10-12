import type { ClientSession, Db } from "mongodb";
import type { canonicalStory } from "../../business/canonical";
import type { PublishedStory } from "../../domain/types";
import type { StoryPersistence } from "../../ports/persistence/interfaces";
import { storyCollections } from "./conts";
import type { StoryDocument, UploadDocument } from "./types";
/**
 * В переданной транзакции записывает историю, исход upload и pending outbox, снимая
 * lease. Не завершает заимствованную сессию самостоятельно.
 */
export const recordPublication = async ({
  db,
  session,
  input,
  upload,
  story,
  event,
}: Readonly<{
  db: Db;
  session: ClientSession;
  input: Parameters<StoryPersistence["publish"]>[0];
  upload: UploadDocument;
  story: PublishedStory;
  event: ReturnType<typeof canonicalStory>;
}>) => {
  await db.collection<StoryDocument>(storyCollections.stories).insertOne(
    {
      _id: input.storyId,
      actorId: input.claim.actorId,
      state: "published",
      expiresAt: input.expiresAt,
      profile: upload.profile,
      key: upload.key,
      story,
    },
    { session },
  );
  await db.collection<UploadDocument>(storyCollections.uploads).updateOne(
    { _id: input.claim.attemptId, "status.state": "pending" },
    {
      $set: {
        status: {
          state: "published",
          operationId: input.claim.operationId,
          story,
        },
        leaseUntil: 0,
        updatedAt: input.now,
      },
    },
    { session },
  );
  await db
    .collection<{ _id: string; state: string; createdAt: number }>(
      storyCollections.outbox,
    )
    .insertOne(
      { _id: event.eventId, ...event, state: "pending", createdAt: input.now },
      { session },
    );
};
