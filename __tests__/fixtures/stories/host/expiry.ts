import { z } from "zod";
import { storyCollections } from "../../../../apps/be-insta/src/domains/stories/adapters/mongo/conts";
import { ownedAuthorIds } from "./ownership";
import type { StoryFixtureResources } from "./types";
export const expireFixtureStory = async ({
  request,
  resources,
}: Readonly<{ request: Request; resources: StoryFixtureResources }>) => {
  const control = z
    .strictObject({ id: z.string(), expiresAt: z.number().int().positive() })
    .parse(await request.json());
  const stories = resources.fixture.native.db.collection<{
    _id: string;
    actorId: string;
    expiresAt: number;
    story: { expiresAt: number };
  }>(storyCollections.stories);
  const result = await stories.updateOne(
    {
      _id: control.id,
      actorId: { $in: await ownedAuthorIds(resources.fixture) },
    },
    {
      $set: {
        expiresAt: control.expiresAt,
        "story.expiresAt": control.expiresAt,
      },
    },
  );
  await resources.invalidate();
  return Response.json({ updated: result.modifiedCount });
};
