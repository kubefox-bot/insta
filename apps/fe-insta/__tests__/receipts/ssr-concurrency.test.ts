import { afterAll, expect, spyOn, test } from "bun:test";
import { createServer } from "vite";
import { SSR_CONFIGURATION } from "../../config/conts";
import { createSsrEnvironment } from "./ssr/environment";
import { createSsrRequest } from "./ssr/request";

const environment = createSsrEnvironment();
const server = await createServer({
  root: new URL("../../", import.meta.url).pathname,
  cacheDir: new URL("../../node_modules/.vite-ssr-concurrency", import.meta.url)
    .pathname,
  ssr: SSR_CONFIGURATION,
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});
await server.listen();
afterAll(async () => {
  await server.close();
  environment.close();
});
const layout = await server.ssrLoadModule("/src/routes/+layout.server.ts");
const history = await server.ssrLoadModule(
  "/src/routes/conversations/[id]/+page.server.ts",
);
const { createSessionSnapshotReader } = await server.ssrLoadModule(
  "/src/domains/users/server/index.ts",
);

/** Ограничивает ожидание наблюдаемого события; таймер доказывает только отсутствие события, не порядок выполнения. */
const observed = async (signal: Promise<void>) => {
  const deadline = Promise.withResolvers<boolean>();
  const timer = setTimeout(() => deadline.resolve(false), 1000);
  try {
    return await Promise.race([signal.then(() => true), deadline.promise]);
  } finally {
    clearTimeout(timer);
  }
};

test("real SSR history starts before held feed/list settle and session is read once", async () => {
  const session = Promise.withResolvers<Response>();
  const feed = Promise.withResolvers<Response>();
  const list = Promise.withResolvers<Response>();
  const actor = { userId: "alice", username: "Alice", generation: "a" };
  const fixture = createSsrRequest({
    reader: createSessionSnapshotReader,
    session: () => session.promise,
    feed: () => feed.promise,
    list: () => list.promise,
  });
  const parent = layout.load(fixture.event);
  const page = history.load({ ...fixture.event, parent: () => parent });
  try {
    expect(await observed(fixture.feedStarted)).toBe(true);
    expect(await observed(environment.policyStarted)).toBe(true);
    expect(fixture.listCalls).toHaveLength(0);
    expect(fixture.historyCalls).toHaveLength(0);
    session.resolve(Response.json({ ok: true, data: actor }));
    expect(await observed(fixture.historyStarted)).toBe(true);
    expect(await observed(fixture.listStarted)).toBe(true);
    expect(fixture.sessionCalls).toHaveLength(1);
    expect(await page).toEqual({
      conversationId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      history: {
        items: [],
        baselineCursor: 0,
        watermark: 0,
        pageInfo: { nextCursor: null, hasMore: false },
      },
      historyIssue: undefined,
      historyActor: actor,
    });
    for (const input of [...fixture.listCalls, ...fixture.historyCalls]) {
      expect(input.owner).toEqual(actor);
      expect(input.cookies).toBe(fixture.event.cookies);
      expect(input.request).toBe(fixture.event.request);
      expect(input.origin).toBe("https://insta.test");
    }
  } finally {
    session.resolve(Response.json({ ok: true, data: actor }));
    list.resolve(
      Response.json({ ok: true, data: { items: [], totalUnreadCount: 7 } }),
    );
    feed.resolve(
      Response.json({
        ok: true,
        data: { authors: [], cursor: null },
        meta: { requestId: "feed" },
      }),
    );
    await Promise.all([parent, page]);
  }
  expect(await parent).toMatchObject({
    session: { actor, status: "authenticated" },
    conversationsActor: actor,
    conversationsTotalUnreadCount: 7,
    selectedIntent: "11111111-1111-4111-8111-111111111111",
    registration: { stage: "start" },
    locale: "en",
    privacy: fixture.event.locals.privacy,
    storiesAvailable: true,
    storiesPolicy: { maxDurationMs: 15000 },
    storiesFeed: { kind: "ready" },
  });
  expect(fixture.headers).toEqual({ "Cache-Control": "no-store" });
});

for (const outcome of ["guest", "unavailable"] as const) {
  test(`real SSR ${outcome} performs no private reads`, async () => {
    const fixture = createSsrRequest({
      reader: createSessionSnapshotReader,
      cookie: outcome === "guest" ? null : "binding",
      session: async () => {
        throw new Error("Session unavailable");
      },
    });
    const parent = layout.load(fixture.event);
    const page = history.load({ ...fixture.event, parent: () => parent });
    const [root, result] = await Promise.all([parent, page]);
    expect(root.session).toEqual({ actor: null, status: outcome });
    expect(root.conversationsActor).toBeNull();
    expect(root.conversationsTotalUnreadCount).toBeUndefined();
    expect(result).toEqual({
      conversationId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      history: null,
      historyIssue: undefined,
      historyActor: null,
    });
    expect(fixture.listCalls.length + fixture.historyCalls.length).toBe(0);
    expect(fixture.sessionCalls).toHaveLength(outcome === "guest" ? 0 : 1);
  });
}

test("overlapping real SSR requests retain their own actor, generation and locale", async () => {
  const session = Promise.withResolvers<Response>();
  const alice = createSsrRequest({
    reader: createSessionSnapshotReader,
    session: () => session.promise,
  });
  const bob = createSsrRequest({
    reader: createSessionSnapshotReader,
    locale: "ru",
    session: async () =>
      Response.json({
        ok: true,
        data: { userId: "bob", username: "Bob", generation: "b" },
      }),
  });
  const first = layout.load(alice.event);
  const firstHistory = history.load({ ...alice.event, parent: () => first });
  const second = layout.load(bob.event);
  const secondHistory = history.load({ ...bob.event, parent: () => second });
  try {
    const [root, page] = await Promise.all([second, secondHistory]);
    expect(root.session.actor).toEqual({
      userId: "bob",
      username: "Bob",
      generation: "b",
    });
    expect(root.locale).toBe("ru");
    expect(page.historyActor).toEqual({
      userId: "bob",
      username: "Bob",
      generation: "b",
    });
    expect(alice.listCalls.length + alice.historyCalls.length).toBe(0);
  } finally {
    session.resolve(
      Response.json({
        ok: true,
        data: { userId: "alice", username: "Alice", generation: "a" },
      }),
    );
    await Promise.all([first, firstHistory]);
  }
  expect((await first).session.actor).toEqual({
    userId: "alice",
    username: "Alice",
    generation: "a",
  });
  expect((await firstHistory).historyActor).toEqual({
    userId: "alice",
    username: "Alice",
    generation: "a",
  });
  expect((await first).locale).toBe("en");
  expect([alice.sessionCalls.length, bob.sessionCalls.length]).toEqual([1, 1]);
});

test("Stories disabled does not start feed or policy and retains guest SSR data", async () => {
  environment.setStories("disabled");
  const policyReads = environment.policyReads();
  let feedReads = 0;
  const fixture = createSsrRequest({
    reader: createSessionSnapshotReader,
    cookie: null,
    session: async () => {
      throw new Error("Guest auth read");
    },
    feed: async () => {
      feedReads += 1;
      throw new Error("Disabled feed read");
    },
  });
  try {
    expect(await layout.load(fixture.event)).toMatchObject({
      storiesAvailable: false,
      storiesFeed: null,
      storiesPolicy: null,
      session: { actor: null, status: "guest" },
      registration: { stage: "start" },
      privacy: fixture.event.locals.privacy,
    });
    expect(feedReads).toBe(0);
    expect(environment.policyReads()).toBe(policyReads);
  } finally {
    environment.setStories("enabled");
  }
});

test("HTTP preparation installs a lazy reader for each health/API request", async () => {
  const { prepareRequest } = await server.ssrLoadModule(
    "/src/app/http/server/prepare.ts",
  );
  const fixture = createSsrRequest({
    reader: createSessionSnapshotReader,
    session: async () => {
      throw new Error("Unprepared reader");
    },
  });
  const previous = fixture.event.locals.getSessionView;
  const event = {
    ...fixture.event,
    url: new URL("https://insta.test/api/health/live"),
    getClientAddress: () => "127.0.0.1",
  };
  await prepareRequest({ event, correlation: {} });
  expect(event.locals.getSessionView).not.toBe(previous);
  const actor = { userId: "alice", username: "Alice", generation: "a" };
  const session = spyOn(event.locals.auth, "session").mockImplementation(
    async () => Response.json({ ok: true, data: actor }),
  );
  try {
    expect(session).not.toHaveBeenCalled();
    const [first, second] = await Promise.all([
      event.locals.getSessionView(),
      event.locals.getSessionView(),
    ]);
    expect(first).toEqual({ actor, status: "authenticated" });
    expect(second).toBe(first);
    expect(session).toHaveBeenCalledTimes(1);
    expect(session.mock.calls[0]?.[0].cookies).toBe(event.cookies);
  } finally {
    session.mockRestore();
  }
});
