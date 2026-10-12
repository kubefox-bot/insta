import { expect, test } from "../../fixtures/browser-egress/test";
import type {} from "../../fixtures/outbox/browser";
import { installOutboxProbe } from "../../fixtures/outbox/install-browser";

test("CHAT-04 IndexedDB persists before send and account max100 is atomic across tabs", async ({
  page,
  context,
}) => {
  const namespace = `insta-chat04-${crypto.randomUUID()}`;
  const second = await context.newPage();
  try {
    for (const tab of [page, second]) {
      await tab.goto("https://localhost/?mode=login");
      await installOutboxProbe(tab);
      await tab.evaluate((name) => window.__outboxProbe.start(name), namespace);
    }
    const first = await page.evaluate(() => window.__outboxProbe.enqueue());
    expect(first.ok).toBe(true);
    expect(
      await second.evaluate(() => window.__outboxProbe.list()),
    ).toHaveLength(1);
    const [a, b] = await Promise.all([
      page.evaluate(() =>
        Promise.all(
          Array.from({ length: 50 }, () => window.__outboxProbe.enqueue()),
        ),
      ),
      second.evaluate(() =>
        Promise.all(
          Array.from({ length: 50 }, () => window.__outboxProbe.enqueue()),
        ),
      ),
    ]);
    expect([...a, ...b].filter((result) => result.ok)).toHaveLength(99);
    expect([...a, ...b].filter((result) => !result.ok)).toEqual([
      { ok: false, error: "QUEUE_FULL" },
    ]);
    await page.reload();
    await installOutboxProbe(page);
    await page.evaluate((name) => window.__outboxProbe.start(name), namespace);
    expect(await page.evaluate(() => window.__outboxProbe.list())).toHaveLength(
      100,
    );
  } finally {
    for (const tab of [page, second])
      if (!tab.isClosed())
        await tab.evaluate(() => window.__outboxProbe?.close());
    await page.evaluate(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        }),
      namespace,
    );
  }
});

import { cleanupOutbox } from "../../fixtures/outbox/cleanup";
import { connectOutbox, loginOutbox } from "../../fixtures/outbox/setup";
import { startRealtimeFixture } from "../../fixtures/realtime/start-browser";

test("CHAT-04 A15 lost response after actual server commit survives reload with stable login generation and one message", async ({
  page,
}) => {
  test.setTimeout(60000);
  const fixture = await startRealtimeFixture();
  const namespace = `insta-chat04-${crypto.randomUUID()}`;
  try {
    await loginOutbox(page, fixture.account);
    const first = await connectOutbox({
      page,
      namespace,
      conversationId: fixture.conversationId,
    });
    const queued = await page.evaluate(() =>
      window.__outboxProbe.enqueue("lost-response synthetic"),
    );
    if (!queued.ok || !queued.record) throw new Error("Enqueue failed");
    await page.route(
      `**/api/conversations/${fixture.conversationId}/messages`,
      async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        await route.abort("failed");
      },
      { times: 1 },
    );
    const lost = await page.evaluate(() => window.__outboxProbe.drain());
    expect(lost.confirmed).toBe(0);
    const committed = await (await fetch(`${fixture.url}/history`)).json();
    expect(committed.data.items).toHaveLength(1);
    const resumed = await connectOutbox({
      page,
      namespace,
      conversationId: fixture.conversationId,
    });
    expect(resumed.generation).toBe(first.generation);
    const retained = await page.evaluate(() => window.__outboxProbe.list());
    expect(retained[0]).toMatchObject({
      key: queued.record.key,
      clientMessageId: queued.record.clientMessageId,
      operationId: queued.record.operationId,
      createdAt: 0,
    });
    await page.evaluate(() => window.__outboxProbe.now(1000));
    expect(
      (await page.evaluate(() => window.__outboxProbe.drain())).confirmed,
    ).toBe(1);
    const serverMessages = (
      await (await fetch(`${fixture.url}/history`)).json()
    ).data.items;
    expect(serverMessages).toHaveLength(1);
    expect(await page.evaluate(() => window.__outboxProbe.list())).toHaveLength(
      0,
    );
  } finally {
    await cleanupOutbox({
      tabs: [page],
      namespace,
      disposers: [fixture.dispose],
    });
  }
});
test("CHAT-04 A16 new real login requires confirmation before any send, exact24h manual attempt preserves key", async ({
  page,
}) => {
  test.setTimeout(60000);
  const fixture = await startRealtimeFixture();
  const namespace = `insta-chat04-${crypto.randomUUID()}`;
  try {
    await loginOutbox(page, fixture.account);
    const first = await connectOutbox({
      page,
      namespace,
      conversationId: fixture.conversationId,
    });
    const queued = await page.evaluate(() =>
      window.__outboxProbe.enqueue("reauth synthetic"),
    );
    if (!queued.ok || !queued.record) throw new Error("Enqueue failed");
    await loginOutbox(page, fixture.account);
    const next = await connectOutbox({
      page,
      namespace,
      conversationId: fixture.conversationId,
    });
    expect(next.generation).not.toBe(first.generation);
    const before = await page.evaluate(() => window.__outboxProbe.drain());
    expect(before.sent).toBe(0);
    const sendCallsAfterReauth = await page.evaluate(() =>
      window.__outboxProbe.sendCalls(),
    );
    expect(sendCallsAfterReauth).toBe(0);
    await page.evaluate(() => window.__outboxProbe.now(86400000));
    expect(
      await page.evaluate(
        (id) => window.__outboxProbe.confirm([id]),
        queued.record.operationId,
      ),
    ).toBe(1);
    expect(
      (await page.evaluate(() => window.__outboxProbe.drain())).confirmed,
    ).toBe(1);
    const serverMessages = (
      await (await fetch(`${fixture.url}/history`)).json()
    ).data.items;
    expect(serverMessages).toHaveLength(1);
    expect(serverMessages[0].clientMessageId).toBe(
      queued.record.clientMessageId,
    );
  } finally {
    await cleanupOutbox({
      tabs: [page],
      namespace,
      disposers: [fixture.dispose],
    });
  }
});
test("CHAT-04 offline queue consumes no attempt; reconnect/focus re-reads actual cookie actor and sends", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  const fixture = await startRealtimeFixture();
  const namespace = `insta-chat04-${crypto.randomUUID()}`;
  try {
    await loginOutbox(page, fixture.account);
    await connectOutbox({
      page,
      namespace,
      conversationId: fixture.conversationId,
    });
    await context.setOffline(true);
    const queued = await page.evaluate(() =>
      window.__outboxProbe.enqueue("offline synthetic"),
    );
    expect(queued.ok).toBe(true);
    await page.evaluate(() => window.__outboxProbe.startAutomatic());
    await expect
      .poll(() => page.evaluate(() => window.__outboxProbe.reconcile()))
      .toBeNull();
    expect(
      (await page.evaluate(() => window.__outboxProbe.list()))[0]?.attempts,
    ).toBe(0);
    await context.setOffline(false);
    await page.evaluate(() => window.__outboxProbe.focus());
    await expect
      .poll(
        async () =>
          (await (await fetch(`${fixture.url}/history`)).json()).data.items
            .length,
      )
      .toBe(1);
    await expect
      .poll(() => page.evaluate(() => window.__outboxProbe.list()))
      .toEqual([]);
    expect(
      await page.evaluate(() => window.__outboxProbe.automaticIssues()),
    ).toEqual([]);
  } finally {
    await context.setOffline(false);
    await cleanupOutbox({
      tabs: [page],
      namespace,
      disposers: [fixture.dispose],
    });
  }
});

import { logoutUser } from "../../fixtures/auth05/ui";
import { startChatFixture } from "../../fixtures/chat05/browser";
import { loginChatUser, openChat } from "../../fixtures/chat05/ui";
import { withResource } from "../../fixtures/lifecycle/with-resource";
import { readStoredOutbox } from "../../fixtures/outbox/read-stored";

test("explicit logout outside conversations deletes retained IndexedDB messages", async ({
  page,
}) => {
  test.setTimeout(90000);
  await withResource({
    start: () => startChatFixture(),
    use: async (fixture) => {
      await loginChatUser(page, fixture.alice);
      await openChat(page, fixture.bob.username);
      await page.route("**/api/conversations/*/messages", (route) =>
        route.request().method() === "POST"
          ? route.abort("failed")
          : route.continue(),
      );
      const composer = page.getByRole("textbox", {
        name: "Message",
        exact: true,
      });
      await composer.fill("Synthetic draft must disappear on logout");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect.poll(() => readStoredOutbox(page)).toHaveLength(1);
      // A full navigation also exercises a fresh auth host with no chat runtime.
      await page.goto("https://localhost/?mode=login");
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("conversation-panel")).toHaveCount(0);
      expect(await readStoredOutbox(page)).toHaveLength(1);
      await logoutUser(page);
      await expect(page.getByTestId("current-actor")).toHaveCount(0);
      await expect(
        page
          .getByRole("banner")
          .getByRole("link", { name: "Sign in", exact: true }),
      ).toBeVisible();
      await expect.poll(() => readStoredOutbox(page)).toEqual([]);
      await loginChatUser(page, fixture.alice);
      expect(await readStoredOutbox(page)).toEqual([]);
    },
  });
});

test("composer persistence rejection retains the draft for explicit retry", async ({
  page,
}) => {
  test.setTimeout(90000);
  await withResource({
    start: () => startChatFixture(),
    use: async (fixture) => {
      await loginChatUser(page, fixture.alice);
      await openChat(page, fixture.bob.username);
      const composer = page.getByRole("textbox", {
        name: "Message",
        exact: true,
      });
      const send = page.getByRole("button", { name: "Send", exact: true });
      await composer.fill("Retained after persistence failure");
      await page.evaluate(() => {
        const original = IDBObjectStore.prototype.add;
        IDBObjectStore.prototype.add = () => {
          IDBObjectStore.prototype.add = original;
          throw new DOMException(
            "Synthetic queue failure",
            "QuotaExceededError",
          );
        };
      });
      await send.click();
      await expect(
        page.getByTestId("conversation-panel").getByRole("alert"),
      ).toContainText("Could not save the outgoing message");
      await expect(composer).toHaveValue("Retained after persistence failure");
      await expect(send).toBeEnabled();
      await expect(
        page.getByTestId("message-list").locator("[data-message-id]"),
      ).toHaveCount(0);
      await send.click();
      await expect(composer).toHaveValue("");
      await expect(
        page
          .getByTestId("message-list")
          .getByText("Retained after persistence failure", { exact: true }),
      ).toHaveCount(1);
    },
  });
});

test("HYG-02 blocked native upgrade closes abandoned success and explicit retry works across two tabs", async ({
  page,
  context,
}) => {
  const namespace = `insta-hyg02-${crypto.randomUUID()}`;
  const second = await context.newPage();
  try {
    for (const tab of [page, second]) {
      await tab.goto("https://localhost/?mode=login");
      await installOutboxProbe(tab);
    }
    await page.evaluate(
      (name) => window.__outboxProbe.connection.block(name),
      namespace,
    );
    await second.evaluate(
      (name) => window.__outboxProbe.connection.start(name),
      namespace,
    );
    expect(
      await second.evaluate(() => window.__outboxProbe.connection.run()),
    ).toBe("PERSISTENCE_FAILED");
    expect(
      await second.evaluate(() => window.__outboxProbe.connection.counts()),
    ).toEqual({ opens: 1, successes: 0, closes: 0 });
    await page.evaluate(() => window.__outboxProbe.connection.release());
    await expect
      .poll(() =>
        second.evaluate(() => window.__outboxProbe.connection.counts()),
      )
      .toEqual({ opens: 1, successes: 1, closes: 1 });
    expect(
      await second.evaluate(() => window.__outboxProbe.connection.run()),
    ).toBe("ready");
    expect(
      await second.evaluate(() => window.__outboxProbe.connection.counts()),
    ).toEqual({ opens: 2, successes: 2, closes: 1 });
    await second.evaluate(() => window.__outboxProbe.connection.close());
    expect(
      await second.evaluate(() => window.__outboxProbe.connection.counts()),
    ).toEqual({ opens: 2, successes: 2, closes: 2 });
  } finally {
    await cleanupOutbox({ tabs: [page, second], namespace });
  }
});
