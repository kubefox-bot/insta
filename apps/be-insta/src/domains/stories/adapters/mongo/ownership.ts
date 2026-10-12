import type { Db } from "mongodb";
import type { StoryOwnership } from "../../ports/maintenance/interfaces";
import { storyCollections } from "./conts";
import type { ReconcileDocument, UploadDocument } from "./types";
/** Подключает проверку ownership и курсоры reconciliation к заимствованной Mongo DB. */
export const createStoryOwnership = (db: Db): StoryOwnership => ({
  /**
   * Читает ownership с primary majority, считая removed запись отсутствующей; отказ
   * чтения возвращает error, чтобы не разрешить удаление объекта.
   */
  read: async ({ profile, key }) => {
    try {
      const found = await db
        .collection<UploadDocument>(storyCollections.uploads)
        .findOne(
          { profile, key, physicalState: { $ne: "removed" } },
          {
            projection: { _id: 1 },
            readConcern: { level: "majority" },
            readPreference: "primary",
          },
        );
      return { kind: found ? "found" : "missing" };
    } catch {
      return { kind: "error" };
    }
  },
  /**
   * Читает сохранённую позицию обхода профиля с primary majority; отсутствие позиции
   * начинает обход заново.
   */
  cursor: async (profile) =>
    (
      await db
        .collection<ReconcileDocument>(storyCollections.reconcile)
        .findOne(
          { _id: profile },
          { readConcern: { level: "majority" }, readPreference: "primary" },
        )
    )?.cursor ?? null,
  /**
   * Сохраняет cursor профиля с majority acknowledgement; null обозначает завершённый круг
   * inventory.
   */
  advance: async ({ profile, cursor }) => {
    await db
      .collection<ReconcileDocument>(storyCollections.reconcile)
      .updateOne(
        { _id: profile },
        { $set: { cursor } },
        { upsert: true, writeConcern: { w: "majority" } },
      );
  },
});
