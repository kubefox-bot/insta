import { storyCollections } from "../../../../apps/be-insta/src/domains/stories/adapters/mongo/conts";
import { ownedAuthorIds } from "./ownership";
import type { StoryFixtureResources } from "./types";
export const cleanupStories = async ({
  fixture,
  storage,
  invalidate,
}: StoryFixtureResources) => {
  const actorIds = await ownedAuthorIds(fixture);
  const uploads = await fixture.native.db
    .collection<{ actorId: string; profile: string; key: string }>(
      storyCollections.uploads,
    )
    .find({ actorId: { $in: actorIds } })
    .toArray();
  for (const upload of uploads)
    await storage.delete({ profile: upload.profile, key: upload.key });
  for (const name of [
    storyCollections.uploads,
    storyCollections.stories,
    storyCollections.outbox,
  ])
    await fixture.native.db
      .collection(name)
      .deleteMany({ actorId: { $in: actorIds } });
  await fixture.native.db
    .collection<{ _id: string }>(storyCollections.authors)
    .deleteMany({ _id: { $in: actorIds } });
  await invalidate();
};
