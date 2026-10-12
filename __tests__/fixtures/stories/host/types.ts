import type { createStoryStorage } from "../../../../apps/be-insta/src/domains/stories/server/index";
import type { createBffEnvironment } from "../../bff-session/environment";
export type Fixture = Awaited<ReturnType<typeof createBffEnvironment>>;
export type StoryFixtureResources = Readonly<{
  fixture: Fixture;
  storage: ReturnType<typeof createStoryStorage>;
  invalidate: () => Promise<void>;
}>;
