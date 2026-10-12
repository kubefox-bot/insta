import { type Db, MongoServerError } from "mongodb";
import type { StoryUploads } from "../../ports/persistence/interfaces";
import { duplicateKeyCode, storyCollections } from "./conts";
import { createPublicationReads } from "./publications";
import type { UploadDocument } from "./types";
/**
 * Создаёт majority-запись claim и CAS-операции lease на коллекции upload; ресурс DB
 * заимствован.
 */
export const createStoryUploads = (db: Db): StoryUploads => {
  const uploads = db.collection<UploadDocument>(storyCollections.uploads, {
    writeConcern: { w: "majority" },
  });
  return {
    /**
     * Записывает уникальную попытку; при duplicate key перечитывает durable исход
     * операции вместо создания второй публикации.
     */
    claim: async (input) => {
      try {
        await uploads.insertOne({
          ...input,
          _id: input.attemptId,
          updatedAt: input.now,
          status: { state: "pending", operationId: input.operationId },
        });
        return { kind: "claimed", claim: input };
      } catch (error) {
        if (
          !(error instanceof MongoServerError) ||
          error.code !== duplicateKeyCode
        )
          throw error;
        return {
          kind: "existing",
          status: await createPublicationReads(db).read(input),
        };
      }
    },
    /**
     * Продлевает только живой pending lease без physical cleanup, не уменьшая срок;
     * отсутствие модификации сообщает как false.
     */
    renew: async (input) =>
      (
        await uploads.updateOne(
          {
            _id: input.attemptId,
            actorId: input.actorId,
            operationId: input.operationId,
            "status.state": "pending",
            leaseUntil: { $gt: input.now },
            physicalState: { $exists: false },
          },
          {
            $max: { leaseUntil: input.leaseUntil },
            $set: { updatedAt: input.now },
          },
        )
      ).modifiedCount === 1,
    /**
     * Переводит только совпавший pending claim в failed и снимает lease; опубликованный
     * исход не перезаписывает, физический учёт сохраняет.
     */
    cancel: async (input) => {
      await uploads.updateOne(
        {
          _id: input.attemptId,
          actorId: input.actorId,
          operationId: input.operationId,
          "status.state": "pending",
        },
        {
          $set: {
            status: {
              state: "failed",
              operationId: input.operationId,
              code: input.code,
            },
            leaseUntil: 0,
          },
        },
      );
    },
  };
};
