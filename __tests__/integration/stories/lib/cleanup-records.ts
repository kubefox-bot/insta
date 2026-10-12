import { storyCollections } from "../../../../apps/be-insta/src/domains/stories/adapters/mongo/conts";
import type { connectDatabase } from "../../../../apps/be-insta/src/lib/database/index";

export const deleteOwnedStoryRecords = async ({
  db,
  actors,
}: Readonly<{
  db: Awaited<ReturnType<typeof connectDatabase>>["apiDb"];
  actors: ReadonlySet<string>;
}>) => {
  for (const actorId of actors)
    for (const name of Object.values(storyCollections))
      await db
        .collection<{ _id: string; actorId?: string }>(name)
        .deleteMany(
          name === storyCollections.authors ? { _id: actorId } : { actorId },
        );
};
