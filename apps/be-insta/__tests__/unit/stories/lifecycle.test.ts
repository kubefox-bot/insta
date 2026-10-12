import { expect, test } from "bun:test";
import { stopRuntimeWorkers } from "../../../src/app/composition/runtime/stop-workers";
import { closeStoriesResources } from "../../../src/app/composition/stories/close";

test("shutdown cancels publications immediately and waits for actual settlement before returning failure", async () => {
  const settled = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  let finished = false;
  const closing = stopRuntimeWorkers({
    mail: async () => {
      throw new Error("mail failed");
    },
    stories: async () => {
      started.resolve();
      await settled.promise;
      finished = true;
    },
  }).then(
    () => null,
    (error) => error,
  );
  await started.promise;
  expect(finished).toBe(false);
  settled.resolve();
  expect(await closing).toBeInstanceOf(Error);
  expect(finished).toBe(true);
});

test("Stories shutdown settles the feed queue and closes infrastructure even after worker failure", async () => {
  const release = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const state = { feedSettled: false, infrastructureClosed: false };
  const workerFailure = new Error("Worker close failed");
  const closing = closeStoriesResources({
    publisher: async () => {
      throw workerFailure;
    },
    jobs: async () => {},
    publicationFeed: async () => {
      entered.resolve();
      await release.promise;
      state.feedSettled = true;
    },
    infrastructure: async () => {
      state.infrastructureClosed = true;
    },
  }).then(
    () => null,
    (error: unknown) => error,
  );
  const first = await Promise.race([
    entered.promise.then(() => "entered"),
    closing.then(() => "closed"),
  ]);
  expect(first).toBe("entered");
  expect(state.infrastructureClosed).toBe(false);
  release.resolve();
  expect(await closing).toBe(workerFailure);
  expect(state).toEqual({ feedSettled: true, infrastructureClosed: true });
});

test("Stories shutdown retains all worker and infrastructure failures after every owner settles", async () => {
  const workerFailure = new Error("Worker close failed");
  const feedFailure = new Error("Feed close failed");
  const mediaFailure = new Error("Media close failed");
  const failure = await closeStoriesResources({
    publisher: async () => {
      throw workerFailure;
    },
    jobs: async () => {},
    publicationFeed: async () => {
      throw feedFailure;
    },
    infrastructure: async () => {
      throw mediaFailure;
    },
  }).then(
    () => null,
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(AggregateError);
  if (!(failure instanceof AggregateError))
    throw new Error("Expected shutdown failure");
  expect(failure.errors).toEqual([workerFailure, feedFailure, mediaFailure]);
});
