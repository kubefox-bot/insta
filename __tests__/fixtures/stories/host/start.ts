import {
  createFeedInvalidation,
  createStoryStorage,
} from "../../../../apps/be-insta/src/domains/stories/server/index";
import { readStoriesConfig } from "../../../../apps/be-insta/src/lib/config/stories/read";
import { connectDragonfly } from "../../../../apps/be-insta/src/lib/dragonfly/index";
import { rendererResponse } from "../../../unit/stories/renderer/response";
import { fixturePort } from "../../auth05/conts";
import { createBffEnvironment } from "../../bff-session/environment";
import { cleanupChatFixture } from "../../chat05/cleanup";
import { readTestApiConfig } from "../../environment";
import { setupFailure } from "../../lifecycle/setup-failure";
import { readStoriesTestConfig } from "../../media/config";
import { readStoryConversation } from "./canonical";
import { cleanupStories } from "./cleanup";
import { disposeStoryHost } from "./dispose";
import { expireFixtureStory } from "./expiry";
export const startStoryHost = async () => {
  const profiles = readStoriesConfig(readStoriesTestConfig());
  if (profiles.mode !== "enabled")
    throw new Error("Stories fixture needs enabled profile");
  const storage = createStoryStorage({
    profiles: profiles.profiles,
    clock: Date.now,
  });
  const fixture = await createBffEnvironment();
  const broker = await connectDragonfly({
    config: readTestApiConfig().dragonfly,
  }).catch(async (error) => {
    try {
      await fixture.dispose();
    } catch (cleanupError) {
      throw setupFailure({
        error,
        cleanupError,
        message: "Stories provider startup and cleanup failed",
      });
    }
    throw error;
  });
  const resources = {
    fixture,
    storage,
    invalidate: createFeedInvalidation(broker),
  };
  const acquired: { server?: ReturnType<typeof Bun.serve> } = {};
  const dispose = () =>
    disposeStoryHost({
      stop: async () => {
        await acquired.server?.stop(true);
      },
      cleanup: async () => {
        const outcomes = await Promise.allSettled([
          cleanupStories(resources),
          cleanupChatFixture({
            fixture,
            broker,
            config: readTestApiConfig(),
            keys: new Set(),
          }),
        ]);
        const failures = outcomes
          .filter((outcome) => outcome.status === "rejected")
          .map((outcome) => outcome.reason);
        if (failures.length)
          throw new AggregateError(
            failures,
            "Stories owned data cleanup failed",
          );
      },
      closeBroker: () => broker.close(),
      closeFixture: fixture.dispose,
    });
  try {
    const account = await fixture.native.account();
    const secondAccount = await fixture.native.account();
    const credentials = {
      account,
      secondAccount,
      signupEmail: fixture.native.email("signup"),
      noJsEmail: fixture.native.email("nojs"),
    };
    acquired.server = Bun.serve({
      hostname: "0.0.0.0",
      port: fixturePort,
      fetch: (request) => {
        if (request.method !== "GET")
          return expireFixtureStory({ request, resources });
        if (new URL(request.url).pathname === "/canonical")
          return readStoryConversation({ request, fixture });
        return rendererResponse(request) ?? Response.json(credentials);
      },
    });
    return { dispose };
  } catch (error) {
    try {
      await dispose();
    } catch (cleanupError) {
      throw setupFailure({
        error,
        cleanupError,
        message: "Stories fixture startup and cleanup failed",
      });
    }
    throw error;
  }
};
