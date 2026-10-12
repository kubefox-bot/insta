import type { createSessionSnapshotReader } from "../../../src/domains/users/server/session/snapshot";

/** Предоставляет request-owned cookies и наблюдаемые BFF-порты без подмены SSR loaders или session reader. */
export const createSsrRequest = ({
  reader,
  session,
  cookie = "binding",
  locale = "en",
  feed = async () =>
    Response.json({
      ok: true,
      data: { authors: [], cursor: null },
      meta: { requestId: "feed" },
    }),
  list = async () =>
    Response.json({ ok: true, data: { items: [], totalUnreadCount: 0 } }),
}: Readonly<{
  reader: typeof createSessionSnapshotReader;
  session: () => Promise<Response>;
  cookie?: string | null;
  locale?: string;
  feed?: () => Promise<Response>;
  list?: () => Promise<Response>;
}>) => {
  const url = new URL(
    "https://insta.test/conversations/aaaaaaaaaaaaaaaaaaaaaaaa?intentId=11111111-1111-4111-8111-111111111111",
  );
  const request = new Request(url);
  const headers: Record<string, string> = {};
  const cookies: Parameters<typeof createSessionSnapshotReader>[0]["cookies"] =
    {
      get: (name: string) => {
        if (name === "insta_session") return cookie ?? undefined;
        if (name === "insta_locale") return locale;
        return undefined;
      },
      getAll: () => [],
      set: () => {
        throw new Error("SSR must not set cookies");
      },
      delete: () => {
        throw new Error("SSR must not delete cookies");
      },
      parse: () => {
        throw new Error("Unexpected cookie parse");
      },
      serialize: () => "",
    };
  const sessionCalls: Parameters<App.Locals["auth"]["session"]>[0][] = [];
  const listCalls: Parameters<App.Locals["conversations"]["list"]>[0][] = [];
  const historyCalls: Parameters<App.Locals["conversations"]["history"]>[0][] =
    [];
  const feedStarted = Promise.withResolvers<void>();
  const listStarted = Promise.withResolvers<void>();
  const historyStarted = Promise.withResolvers<void>();
  const auth = {
    session: async (input: Parameters<App.Locals["auth"]["session"]>[0]) => {
      sessionCalls.push(input);
      return session();
    },
  };
  const event = {
    url,
    request,
    params: { id: "aaaaaaaaaaaaaaaaaaaaaaaa" },
    cookies,
    setHeaders: (values: Record<string, string>) =>
      Object.assign(headers, values),
    locals: {
      auth,
      getSessionView: reader({ auth, request, cookies, origin: url.origin }),
      conversations: {
        list: async (
          input: Parameters<App.Locals["conversations"]["list"]>[0],
        ) => {
          listCalls.push(input);
          listStarted.resolve();
          return list();
        },
        history: async (
          input: Parameters<App.Locals["conversations"]["history"]>[0],
        ) => {
          historyCalls.push(input);
          historyStarted.resolve();
          return Response.json({
            ok: true,
            data: {
              items: [],
              baselineCursor: 0,
              watermark: 0,
              pageInfo: { nextCursor: null, hasMore: false },
            },
          });
        },
      },
      stories: {
        feed: () => {
          feedStarted.resolve();
          return feed();
        },
      },
      privacy: { choice: "necessary", policyVersion: "1", revision: 0 },
    },
  };
  return {
    event,
    headers,
    sessionCalls,
    listCalls,
    historyCalls,
    feedStarted: feedStarted.promise,
    listStarted: listStarted.promise,
    historyStarted: historyStarted.promise,
  };
};
