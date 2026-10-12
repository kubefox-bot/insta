import { afterAll, expect, test } from "bun:test";
import { RealtimeErrorCode } from "@insta/contracts/realtime";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { writable } from "svelte/store";
import { createServer } from "vite";
import { CSS_CONFIGURATION, SSR_CONFIGURATION } from "../../config/conts";
import type {
  Conversation,
  ConversationView,
} from "../../src/domains/conversations/browser/index";
import { messages } from "../../src/lib/i18n/index";

const conversationId = "a".repeat(24);
const conversation: Conversation = {
  id: conversationId,
  participantIds: ["alice", "edd"],
  lastSequence: 0,
  lastActivityAt: 0,
  recipientUsername: "Edd",
};
const server = await createServer({
  root: new URL("../../", import.meta.url).pathname,
  configFile: false,
  cacheDir: new URL("../../node_modules/.vite-conversations", import.meta.url)
    .pathname,
  plugins: [svelte({ configFile: false })],
  ssr: {
    ...SSR_CONFIGURATION,
    // Keep the renderer and compiled components in one Vite-owned SSR context.
    noExternal: [...SSR_CONFIGURATION.noExternal, "svelte", /^svelte\//],
    optimizeDeps: {
      exclude: ["svelte", "svelte/server", "svelte/internal/server"],
    },
  },
  css: CSS_CONFIGURATION,
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});
await server.listen();
afterAll(() => server.close());
const { render } = await server.ssrLoadModule("svelte/server");
const { ConversationList } = await server.ssrLoadModule(
  "/src/domains/conversations/browser/index.ts",
);
const { default: Page } = await server.ssrLoadModule(
  "/src/routes/conversations/[id]/+page.svelte",
);

test("selected row exposes the canonical counterpart without a prefix or cached stale name", () => {
  const html = render(ConversationList, {
    props: {
      conversations: [conversation],
      selectedId: conversationId,
      actorId: "alice",
      usernames: new Map([["edd", "StaleName"]]),
      copy: messages.en,
    },
  }).body;
  expect(html).toContain('aria-current="page"');
  expect(html).toMatch(/>Edd<\/span>/);
  expect(html).not.toContain("Chat with");
  expect(html).not.toContain("StaleName");
});

test("direct SSR detail displays canonical counterpart before any directory search", () => {
  const html = renderDetail(conversation);
  expect(html).toMatch(/<h2[^>]*>Edd<\/h2>/);
  expect(html).not.toContain("Just the two of you");
});

test("canonical null never revives a stale private directory name in row or detail", () => {
  const missing = { ...conversation, recipientUsername: null };
  const html = renderDetail(missing, new Map([["edd", "StaleName"]]));
  expect(html).toMatch(/<h2[^>]*>Chat<\/h2>/);
  expect(html).not.toContain("StaleName");
  const row = render(ConversationList, {
    props: {
      conversations: [missing],
      selectedId: null,
      actorId: "alice",
      usernames: new Map([["edd", "StaleName"]]),
      copy: messages.en,
    },
  }).body;
  expect(row).not.toContain("StaleName");
  expect(row).toMatch(/>Chat<\/span>/);
});

test("legacy start response can use its current actor-owned directory name", () => {
  const { recipientUsername: _canonical, ...legacy } = conversation;
  const html = renderDetail(legacy, new Map([["edd", "Edd"]]));
  expect(html).toMatch(/<h2[^>]*>Edd<\/h2>/);
});

test("long RU and EN counterpart names remain complete in link and heading accessible text", () => {
  for (const username of [
    "ДлинноеИмяСобеседника".repeat(4),
    "LongCounterpartUsername".repeat(4),
  ]) {
    const selected = { ...conversation, recipientUsername: username };
    const row = render(ConversationList, {
      props: {
        conversations: [selected],
        selectedId: conversationId,
        actorId: "alice",
        copy: messages.en,
      },
    }).body;
    expect(row).toContain(`title="${username}"`);
    expect(row).toContain(`>${username}</span>`);
    expect(renderDetail(selected)).toContain(`>${username}</h2>`);
  }
});

const renderDetail = (
  selected: Conversation,
  directoryNames = new Map<string, string>(),
  options: Partial<Pick<ConversationView, "connection" | "connectionIssue">> &
    Readonly<{
      locale?: "en" | "ru";
      historyIssue?: string;
      withComposer?: boolean;
    }> = {},
) =>
  render(Page, {
    props: {
      data: {
        conversationId,
        locale: options.locale ?? "en",
        history: null,
        historyActor: { userId: "alice", generation: "g1" },
        historyIssue: options.historyIssue,
      },
    },
    context: new Map([
      [
        "insta/conversations",
        {
          store: {
            view: writable({
              actor: { userId: "alice", generation: "g1" },
              conversations: [selected],
              selectedId: conversationId,
              histories: new Map(),
              connection: options.connection ?? "connected",
              connectionIssue: options.connectionIssue,
            }),
            select: () => {},
            hydrate: () => {},
          },
          drafts: { view: writable(new Map()) },
          directoryNames: writable(directoryNames),
          runtime: () =>
            options.withComposer
              ? {
                  outbox: {
                    view: writable({ records: [] }),
                    enqueue: async () => {},
                  },
                  receipts: { readVisible: async () => {} },
                }
              : null,
        },
      ],
    ]),
  }).body;

const { Composer, MessageList } = await server.ssrLoadModule(
  "/src/domains/conversations/browser/index.ts",
);
const renderComposer = (text: string, locale: "en" | "ru" = "ru") =>
  render(Composer, {
    props: {
      text,
      copy: messages[locale],
      change: () => {},
      send: async () => {
        throw new Error("SSR cannot send");
      },
    },
  }).body;

test("compact composer retains a native message label and an icon-only named send button", () => {
  const html = renderComposer("Draft");
  expect(html).not.toContain(">Написать<");
  expect(html).toMatch(/<label[^>]*>Сообщение<\/label>/);
  expect(html).toMatch(/<textarea[^>]*rows="1"/);
  expect(html).toMatch(/<button[^>]*aria-label="Отправить"/);
  expect(html).toMatch(/<button[^>]*title="Отправить"/);
  expect(html).toContain("<svg");
});

test("empty and Unicode-whitespace drafts disable send while a valid draft enables it", () => {
  for (const text of ["", " \n\t\u2003"]) {
    expect(renderComposer(text)).toMatch(/<button[^>]*disabled/);
  }
  expect(renderComposer("Valid")).not.toMatch(/<button[^>]*disabled/);
});

test("counter appears only in the final tenth of the canonical code-point limit", () => {
  expect(renderComposer("😀".repeat(3599))).not.toContain("3599/4000");
  expect(renderComposer("😀".repeat(3600))).toContain("3600/4000");
  expect(renderComposer("😀".repeat(4000))).toContain("4000/4000");
});

test("message bubbles preserve canonical anchor ids, escaped text and canonical ISO time and the SSR timezone placeholder", () => {
  const html = render(MessageList, {
    props: {
      items: [
        {
          id: "m1",
          conversationId,
          authorId: "alice",
          sequence: 1,
          text: "<script>own</script>\nline",
          createdAt: "2026-10-11T12:34:56.000Z",
        },
        {
          id: "m2",
          conversationId,
          authorId: "edd",
          sequence: 2,
          text: "Incoming",
          createdAt: "2026-10-11T12:35:57.000Z",
        },
      ],
      actorId: "alice",
      locale: "en",
      copy: messages.en,
      earlier: false,
      loading: false,
      loadEarlier: async () => {},
    },
  }).body;
  expect(html).toContain('data-message-id="m1"');
  expect(html).toContain('data-message-id="m2"');
  expect(html).toContain("&lt;script>own&lt;/script>");
  expect(html).toMatch(
    /<time[^>]*datetime="2026-10-11T12:34:56.000Z"[^>]*>--:--<\/time>/,
  );
  expect(html).toContain('data-own="true"');
  expect(html).not.toContain("Delivered");
  expect(html).not.toContain("Read");
});

test("terminal protocol state renders F1 localized copy and a page reload action without reconnect wording", () => {
  for (const locale of ["en", "ru"] as const) {
    const copy = messages[locale];
    const html = renderDetail(conversation, new Map(), {
      connection: "error",
      connectionIssue: RealtimeErrorCode.ProtocolUnsupported,
      locale,
    });
    expect(html).toContain(copy.errors.protocolUnsupported);
    expect(html).toContain(copy.common.reloadPage);
    expect(html).not.toContain(copy.conversations.reconnecting);
    expect(html).not.toContain(copy.common.retry);
  }
});

test("inaccessible chat renders honest RU/EN copy with no composer or retry; available chat retains composer", () => {
  for (const locale of ["ru", "en"] as const) {
    const denied = renderDetail(conversation, new Map(), {
      locale,
      historyIssue: "HISTORY_FORBIDDEN",
      withComposer: true,
    });
    expect(denied).toContain(messages[locale].conversations.unavailable);
    expect(denied).not.toContain(messages[locale].errors.unavailable);
    expect(denied).not.toContain("<textarea");
    expect(denied).not.toContain(messages[locale].common.retry);
    expect(
      renderDetail(conversation, new Map(), { locale, withComposer: true }),
    ).toContain("<textarea");
  }
});
