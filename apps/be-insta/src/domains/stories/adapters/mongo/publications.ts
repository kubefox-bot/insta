import { StoryErrorCode } from "@insta/contracts/errors";
import type { Db } from "mongodb";
import type { StoryPersistence } from "../../ports/persistence/interfaces";
import { storyCollections } from "./conts";
import type { StoryDocument, UploadDocument } from "./types";
/**
 * Собирает чтение durable исхода upload и размещения опубликованной истории на переданной
 * DB.
 */
export const createPublicationReads = (
  db: Db,
): Pick<StoryPersistence, "read" | "findStory"> => ({
  /**
   * Читает исход по автору и operation id с primary majority. Pending с уже начатым
   * physical cleanup отображает в cancelled, отсутствие — в not_found.
   */
  read: async ({ actorId, operationId }) => {
    const upload = await db
      .collection<UploadDocument>(storyCollections.uploads)
      .findOne(
        { actorId, operationId },
        { readConcern: { level: "majority" }, readPreference: "primary" },
      );
    if (upload?.physicalState && upload.status.state === "pending")
      return {
        state: "failed",
        operationId,
        code: StoryErrorCode.UploadCancelled,
      };
    return upload?.status ?? { state: "not_found", operationId };
  },
  /**
   * Возвращает опубликованную запись вместе с её историческим storage-профилем; проверку
   * expiresAt оставляет use case playback.
   */
  findStory: async (id) => {
    const story = await db
      .collection<StoryDocument>(storyCollections.stories)
      .findOne({ _id: id, state: "published" });
    return story
      ? { story: story.story, profile: story.profile, key: story.key }
      : null;
  },
});
