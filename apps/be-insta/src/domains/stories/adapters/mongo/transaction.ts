import { Result } from "@bloodyowl/boxed";
import { StoryErrorCode } from "@insta/contracts/errors";
import type { ClientSession, Db } from "mongodb";
import type { canonicalStory } from "../../business/canonical";
import { storyPolicy } from "../../domain/conts";
import { publicationResult } from "../../domain/policy";
import type { StoryPersistence } from "../../ports/persistence/interfaces";
import { storyCollections } from "./conts";
import { recordPublication } from "./record-publication";
import type {
  AuthorDocument,
  PublicationRecording,
  StoryDocument,
  UploadDocument,
} from "./types";
/**
 * Проверяет живой claim и сериализует active-count решением через запись автора. При
 * доступном лимите сохраняет историю/outbox в переданной транзакции; существующий исход
 * возвращает без новой публикации.
 */
export const publishWithinTransaction = async ({
  db,
  session,
  input,
  event,
  recordPublication: recordDelivery,
}: Readonly<{
  db: Db;
  session: ClientSession;
  input: Parameters<StoryPersistence["publish"]>[0];
  event: ReturnType<typeof canonicalStory>;
  recordPublication?: PublicationRecording;
}>): ReturnType<StoryPersistence["publish"]> => {
  const uploads = db.collection<UploadDocument>(storyCollections.uploads);
  const upload = await uploads.findOne(
    {
      _id: input.claim.attemptId,
      actorId: input.claim.actorId,
      operationId: input.claim.operationId,
    },
    { session },
  );
  if (!upload) return Result.Error(StoryErrorCode.UploadCancelled);
  if (upload.status.state !== "pending")
    return publicationResult(upload.status);
  if (upload.physicalState || upload.leaseUntil <= input.now)
    return Result.Error(StoryErrorCode.UploadCancelled);
  // This write serializes every active-count decision for one author.
  await db
    .collection<AuthorDocument>(storyCollections.authors)
    .updateOne(
      { _id: input.claim.actorId },
      { $inc: { revision: 1 } },
      { session },
    );
  const stories = db.collection<StoryDocument>(storyCollections.stories);
  const active = await stories.countDocuments(
    {
      actorId: input.claim.actorId,
      state: "published",
      expiresAt: { $gt: input.now },
    },
    { session },
  );
  if (active >= storyPolicy.activeLimit)
    return Result.Error(StoryErrorCode.ActiveLimit);
  const story = {
    id: input.storyId,
    author: input.author,
    publishedAt: input.now,
    expiresAt: input.expiresAt,
    durationMs: input.media.durationMs,
  };
  await recordPublication({ db, session, input, upload, story, event });
  await recordDelivery?.({ session, event });
  return Result.Ok(story);
};
