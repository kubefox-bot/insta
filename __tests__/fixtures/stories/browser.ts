import { startAuthFixture } from "../auth05/browser";
import { readStoryFixtureComposition } from "./config";
export const startStoryFixture = () =>
  startAuthFixture({
    hostEntrypoint: "__tests__/fixtures/stories/host.ts",
    composeFiles: readStoryFixtureComposition(),
  });
