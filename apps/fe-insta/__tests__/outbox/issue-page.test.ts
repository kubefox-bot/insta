import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { SessionErrorCode } from "@insta/contracts/errors";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { get, writable } from "svelte/store";
import { createServer } from "vite";
import { CSS_CONFIGURATION, SSR_CONFIGURATION } from "../../config/conts";
import type {
  OutboxBrowser,
  OutboxView,
} from "../../src/domains/conversations/browser/outbox/index";
import { outboxHarness } from "../fixtures/outbox/harness";
import { memoryQueue, unavailableQueue } from "../fixtures/outbox/memory";

test("conversation page separates outbox read, confirmation, and unsaved draft failures", async () => {
  const conversationId = "a".repeat(24);
  const server = await createServer({
    root: new URL("../../", import.meta.url).pathname,
    configFile: false,
    plugins: [svelte({ configFile: false })],
    ssr: SSR_CONFIGURATION,
    css: CSS_CONFIGURATION,
    logLevel: "error",
  });
  const outbox = outboxHarness({
    queue: {
      ...memoryQueue(),
      list: async () => Result.Error("PERSISTENCE_FAILED"),
    },
    sender: async () => ({ kind: "unknown" }),
  });
  const unsaved = outboxHarness({
    queue: unavailableQueue(),
    sender: async () => ({ kind: "unknown" }),
  });
  try {
    await server.listen();
    const { default: Page } = await server.ssrLoadModule(
      "/src/routes/conversations/[id]/+page.svelte",
    );
    const { render } = await server.ssrLoadModule("svelte/server");
    const outboxView = writable<OutboxView>({
      ownerId: "alice",
      records: [],
      issue: "PERSISTENCE_FAILED",
      issueSource: "read",
      busy: false,
    });
    const view = writable({
      actor: { userId: "alice", generation: "g1" },
      conversations: [],
      selectedId: conversationId,
      histories: new Map(),
      connection: "connected",
    });
    let currentOutbox: Pick<OutboxBrowser, "view" | "wake"> = {
      view: outboxView,
      wake: async () => ({ sent: 0, confirmed: 0, needsConfirmation: 0 }),
    };
    const context = new Map([
      [
        "insta/conversations",
        {
          store: {
            view,
            select: () => {},
            hydrate: () => {},
            report: () => {},
          },
          drafts: {
            view: writable(new Map([[conversationId, "unsaved draft"]])),
            edit: () => {},
          },
          runtime: () => ({
            outbox: currentOutbox,
            receipts: { readVisible: () => {} },
            synchronize: async () => {},
            earlier: async () => {},
          }),
        },
      ],
    ]);
    const props = {
      data: {
        conversationId,
        locale: "ru",
        history: null,
        historyActor: null,
        historyIssue: undefined,
      },
    };
    const failedRead = render(Page, { props, context }).body;
    expect(failedRead).toContain("Не удалось прочитать ожидающие сообщения");
    expect(failedRead).toContain("Повторить");

    for (const variant of [
      { state: "queued", needsConfirmation: false },
      { state: "confirmation", needsConfirmation: true },
      {
        state: "terminal",
        needsConfirmation: false,
        errorCode: "MESSAGE_REJECTED",
      },
    ] as const) {
      const record = {
        ownerId: "alice",
        conversationId,
        text: "Queued message",
        key: "queue-key",
        clientMessageId: "client-message",
        operationId: "operation",
        createdAt: 1791712800000,
        attempts: 0,
        nextAttemptAt: 0,
        lastAuthGeneration: "g1",
        revision: 1,
        manualAttempt: false,
        ...variant,
      } satisfies OutboxView["records"][number];
      outboxView.set({ ownerId: "alice", records: [record], busy: false });
      const html = render(Page, { props, context }).body;
      const article = html.match(
        /<article[^>]*data-testid="pending-message"[^>]*>[\s\S]*?<\/article>/,
      )?.[0];
      if (!article) throw new Error("Expected rendered pending message");
      const detailEnd = article.indexOf("</span>");
      const metadataTime = article.indexOf("<time");
      expect(detailEnd).toBeGreaterThan(0);
      expect(metadataTime).toBeGreaterThan(detailEnd);
      if (variant.state === "confirmation") {
        expect(article).toContain("Отправить ожидающие сообщения");
        expect(metadataTime).toBeGreaterThan(article.indexOf("</button>"));
      }
      expect(article).toContain(
        {
          queued: 'aria-label="Отправляется…',
          confirmation: 'aria-label="Отправляется…',
          terminal: "MESSAGE_REJECTED",
        }[variant.state],
      );
      const english = render(Page, {
        props: { data: { ...props.data, locale: "en" } },
        context,
      }).body;
      expect(english).toContain(
        {
          queued: 'aria-label="Sending…',
          confirmation: 'aria-label="Sending…',
          terminal: "MESSAGE_REJECTED",
        }[variant.state],
      );
      expect(article).toContain(
        'data-message-mark="' +
          (variant.state === "terminal" ? "error" : "waiting") +
          '"',
      );
    }

    outboxView.set({
      ownerId: "alice",
      records: [],
      issue: SessionErrorCode.ActorChanged,
      issueSource: "confirmation",
      busy: false,
    });
    const failedConfirmation = render(Page, { props, context }).body;
    expect(failedConfirmation).toContain("Аккаунт изменился");

    const confirmation = await outbox.outbox.confirmResume([
      "pending-operation",
    ]);
    expect(confirmation.isError()).toBe(true);
    expect(get(outbox.outbox.view)).toMatchObject({
      records: [],
      issue: "PERSISTENCE_FAILED",
      issueSource: "confirmation",
    });
    currentOutbox = outbox.outbox;
    const failedSelection = render(Page, { props, context }).body;
    expect(failedSelection).toContain("Сервис временно недоступен");
    expect(failedSelection).not.toContain(">Повторить<");

    const draft = { conversationId, text: "unsaved draft" };
    const failedEnqueue = await unsaved.outbox.enqueue(draft);
    expect(failedEnqueue.isError()).toBe(true);
    if (failedEnqueue.isError())
      expect(failedEnqueue.getError()).toBe("PERSISTENCE_FAILED");
    currentOutbox = unsaved.outbox;
    const failedSave = render(Page, { props, context }).body;
    expect(failedSave).toContain("unsaved draft");
    expect(failedSave).not.toContain(
      "Не удалось прочитать ожидающие сообщения",
    );
    expect(failedSave).not.toContain(">Повторить<");
  } finally {
    outbox.outbox.dispose();
    unsaved.outbox.dispose();
    await server.close();
  }
}, 20000);
