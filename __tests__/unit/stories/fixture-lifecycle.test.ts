import { expect, test } from "bun:test";
import { disposeStoryHost } from "../../fixtures/stories/host/dispose";

test("a failed host stop still releases run-owned providers and retains all cleanup failures", async () => {
  const releases: string[] = [];
  const stopFailure = new Error("host stop failed");
  const cleanupFailure = new Error("storage acknowledgement failed");
  const result = disposeStoryHost({
    stop: async () => {
      releases.push("stop");
      throw stopFailure;
    },
    cleanup: async () => {
      releases.push("cleanup");
      throw cleanupFailure;
    },
    closeBroker: () => {
      releases.push("broker");
    },
    closeFixture: async () => {
      releases.push("fixture");
    },
  }).catch((error) => error);
  const failure = await result;
  expect(releases).toEqual(["stop", "cleanup", "broker", "fixture"]);
  expect(failure).toBeInstanceOf(AggregateError);
  expect(failure.errors).toEqual([stopFailure, cleanupFailure]);
});
