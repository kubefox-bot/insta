import { expect, test } from "bun:test";
import { get } from "svelte/store";
import type { Command } from "../../../../../lib/realtime/index";
import type { FeedPage } from "../../../domain/feed/types";
import { createStoryFeed } from "../../feed";
import { createStorySubscription } from "../create";

const epoch = "00000000-0000-4000-8000-000000000001";
const subscriptionId = "00000000-0000-4000-8000-000000000002";
const position = { streamId: "stories:public", epoch, cursor: 0 };
const setup = (
  refresh?: () => Promise<"applied" | "retry-later" | "stale">,
) => {
  const operations: string[] = [];
  const outcomes: ("applied" | "retry-later" | "stale")[] = [];
  const owner = createStorySubscription({
    uuid: () => crypto.randomUUID(),
    report: () => {},
    refresh:
      refresh ??
      (async () => {
        operations.push("snapshot");
        return outcomes.shift() ?? "applied";
      }),
    command: async (command: Command) => {
      operations.push(command.type);
      const data = () => {
        if (command.type === "conversations.activate") return command.data;
        if (command.type === "stories.feed.unsubscribe")
          return {
            subscription: "stories" as const,
            subscribed: false as const,
          };
        return {
          subscription: "stories" as const,
          subscriptionId,
          baseline: position,
        };
      };
      return {
        version: 1,
        kind: "ack",
        ok: true,
        meta: { requestId: crypto.randomUUID() },
        data: data(),
      };
    },
  });
  return { owner, operations, outcomes };
};
const event = {
  version: 1,
  kind: "event",
  type: "stories.feed.changed",
  eventId: epoch,
  occurredAt: new Date(0).toISOString(),
  meta: { requestId: epoch },
  data: {},
  delivery: { ...position, cursor: 1, subscriptionId },
} as const;
test("Stories prepare, canonical snapshot, activate; duplicate applies only once", async () => {
  const { owner, operations } = setup();
  await owner.ensure();
  expect(operations).toEqual([
    "stories.feed.subscribe",
    "snapshot",
    "conversations.activate",
  ]);
  expect(
    (await owner.delivery.receive({ kind: "single", event }, () => true))?.reply
      .kind,
  ).toBe("applied");
  expect(
    (await owner.delivery.receive({ kind: "single", event }, () => true))?.reply
      .kind,
  ).toBe("applied");
  expect(operations.filter((x) => x === "snapshot")).toHaveLength(2);
  owner.dispose();
});
test("temporary feed failure preserves cursor and retries same WS event", async () => {
  const { owner, outcomes } = setup();
  await owner.ensure();
  outcomes.push("retry-later", "applied");
  expect(
    (await owner.delivery.receive({ kind: "single", event }, () => true))?.reply
      .kind,
  ).toBe("retry-later");
  expect(
    (await owner.delivery.receive({ kind: "single", event }, () => true))?.reply
      .kind,
  ).toBe("applied");
  owner.dispose();
});
test("connection loss rejects late apply and resumes from the last applied cursor", async () => {
  const { owner, operations } = setup();
  await owner.ensure();
  owner.lost();
  expect(
    await owner.delivery.receive({ kind: "single", event }, () => true),
  ).toBeNull();
  await owner.ensure();
  expect(operations.filter((x) => x === "stories.feed.subscribe")).toHaveLength(
    2,
  );
  owner.dispose();
});

test("a WS invalidation adds a previously absent author to the visible feed before ACK", async () => {
  let page: FeedPage = { authors: [], cursor: null };
  const feed = createStoryFeed({
    initial: { kind: "ready", page },
    read: async () => page,
    clock: { now: () => 100, schedule: () => () => {} },
  });
  const { owner } = setup(feed.refreshForDelivery);
  await owner.ensure();
  expect(get(feed.view).authors).toHaveLength(0);
  const author = { id: "bod", username: "bod" };
  page = {
    authors: [
      {
        author,
        latestPublishedAt: 100,
        stories: [
          {
            id: "new-story",
            author,
            publishedAt: 100,
            expiresAt: 1000,
            durationMs: 500,
          },
        ],
      },
    ],
    cursor: null,
  };
  expect(
    (await owner.delivery.receive({ kind: "single", event }, () => true))?.reply
      .kind,
  ).toBe("applied");
  expect(get(feed.view).authors[0]?.author.username).toBe("bod");
  owner.dispose();
  feed.dispose();
});
test("late canonical read cannot ACK after the subscription loses its generation", async () => {
  const response = Promise.withResolvers<"applied">();
  let reads = 0;
  const { owner } = setup(async () => {
    reads++;
    return reads === 1 ? "applied" : response.promise;
  });
  await owner.ensure();
  const applying = owner.delivery.receive(
    { kind: "single", event },
    () => true,
  );
  await Promise.resolve();
  owner.lost();
  response.resolve("applied");
  expect(await applying).toBeNull();
  owner.dispose();
});
