import { receiptBatchSchema } from "@insta/contracts/messages";
import { logoutUser } from "../../fixtures/auth05/ui";
import { expect } from "../../fixtures/browser-egress/test";
import { startChatFixture } from "../../fixtures/chat05/browser";
import {
  loginChatUser,
  openChat,
  seedChatMessages,
} from "../../fixtures/chat05/ui";
import {
  browserState,
  observeReceiptEvents,
  readMarks,
  recordAcknowledgments,
} from "./marks/evidence";

import { openHidden } from "./marks/native/open-hidden";
import { test } from "./marks/native/test";

// Real tab visibility/focus is part of this contract; headless focus emulation is insufficient.
test.use({ headless: false, locale: "en-US" });

test("marks actual disconnected -> accepted background -> visible read; page boundary, two tabs, Mongo timestamps and stable ordering", async ({
  page,
  nativeRecipient,
}) => {
  test.setTimeout(120000);
  const fixture = await startChatFixture();
  const peer = nativeRecipient.context;
  const bob = await peer.newPage();
  const acknowledgments = recordAcknowledgments(bob);
  const duplicateRelease = Promise.withResolvers<void>();
  const events = await observeReceiptEvents(page, { current: false });
  try {
    await loginChatUser(page, fixture.alice);
    const url = await openChat(page, fixture.bob.username);
    await seedChatMessages({
      page,
      url,
      texts: Array.from(
        { length: 52 },
        (_, index) => `Marks history ${index + 1}`,
      ),
    });
    await page.reload();
    const snapshot = () =>
      readMarks({ fixtureUrl: fixture.url, conversationUrl: url });
    const before = await snapshot();
    expect(before.messages).toHaveLength(52);
    expect(before.receipts).toEqual([]);
    await expect(page.locator('[data-message-mark="sent"]')).toHaveCount(50);
    await loginChatUser(bob, fixture.bob);
    const parking = await peer.newPage();
    await parking.goto("about:blank");
    await openHidden({ page: bob, parking, url });
    await expect(bob.getByTestId("message-list").locator("li")).toHaveCount(50);
    expect(await browserState(bob)).toEqual({
      visibility: "hidden",
      focused: false,
    });
    await expect.poll(async () => (await snapshot()).receipts.length).toBe(50);
    const delivered = await snapshot();
    expect(
      delivered.receipts.every(
        (receipt) => receipt.deliveredAt !== null && receipt.readAt === null,
      ),
    ).toBe(true);
    expect(delivered.receipts.map((receipt) => receipt.sequence)).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 3),
    );
    await expect(page.locator('[data-message-mark="delivered"]')).toHaveCount(
      50,
    );
    await bob.bringToFront();
    await bob.getByTestId("message-composer").focus();
    expect(await browserState(bob)).toEqual({
      visibility: "visible",
      focused: true,
    });
    await expect
      .poll(
        async () =>
          (await snapshot()).receipts.filter(
            (receipt) => receipt.readAt !== null,
          ).length,
      )
      .toBeGreaterThan(0);
    const visible = await snapshot();
    expect(
      visible.receipts.filter((receipt) => receipt.readAt !== null).length,
    ).toBeLessThan(50);
    expect(
      visible.receipts.find((receipt) => receipt.sequence === 3)?.readAt,
    ).toBeNull();
    expect(
      visible.receipts.find((receipt) => receipt.sequence === 52)?.readAt,
    ).not.toBeNull();
    await expect(
      page.locator('[data-message-mark="read"]').last(),
    ).toBeVisible();
    await bob
      .getByRole("button", { name: "Load earlier messages", exact: true })
      .click();
    await expect(bob.getByTestId("message-list").locator("li")).toHaveCount(52);
    await bob
      .getByTestId("message-list")
      .locator("li")
      .first()
      .scrollIntoViewIfNeeded();
    await expect
      .poll(
        async () =>
          (await snapshot()).receipts.find((receipt) => receipt.sequence === 1)
            ?.readAt ?? null,
      )
      .not.toBeNull();
    const read = await snapshot();
    const unread = read.receipts.find(
      (receipt) => receipt.sequence >= 3 && receipt.readAt === null,
    );
    if (!unread)
      throw new Error(
        "Expected a delivered offscreen row for concurrent read acknowledgments",
      );
    const duplicate = await peer.newPage();
    const duplicateAcknowledgments = recordAcknowledgments(duplicate);
    await openHidden({ page: duplicate, parking, url });
    await expect(
      duplicate.locator(`[data-message-id="${unread.messageId}"]`),
    ).toHaveCount(1);
    const attempts = [bob, duplicate].map((current) => ({
      page: current,
      reached: Promise.withResolvers<void>(),
      confirmed: Promise.withResolvers<Awaited<ReturnType<typeof readMarks>>>(),
    }));
    for (const attempt of attempts) {
      await attempt.page.route(
        `**/api${new URL(url).pathname}/receipts`,
        async (route) => {
          const batch = receiptBatchSchema.parse(
            route.request().postDataJSON(),
          );
          if (
            batch.status !== "read" ||
            !batch.messageIds.includes(unread.messageId)
          )
            return route.continue();
          attempt.reached.resolve();
          await duplicateRelease.promise;
          const response = attempt.page.waitForResponse(
            (candidate) => candidate.request() === route.request(),
          );
          await route.continue();
          expect((await response).status()).toBe(200);
          attempt.confirmed.resolve(await snapshot());
        },
      );
    }
    for (const attempt of attempts) {
      await attempt.page.bringToFront();
      await attempt.page
        .locator(`[data-message-id="${unread.messageId}"]`)
        .scrollIntoViewIfNeeded();
      await attempt.reached.promise;
    }
    // Both actual browser snapshots and outbound read requests precede either commit.
    expect(
      (await snapshot()).receipts.find(
        (receipt) => receipt.messageId === unread.messageId,
      )?.readAt,
    ).toBeNull();
    duplicateRelease.resolve();
    const confirmations = await Promise.all(
      attempts.map((attempt) => attempt.confirmed.promise),
    );
    const firstReceipt = confirmations[0]?.receipts.find(
      (receipt) => receipt.messageId === unread.messageId,
    );
    expect(firstReceipt?.readAt).toEqual(expect.any(Number));
    expect(
      confirmations[1]?.receipts.find(
        (receipt) => receipt.messageId === unread.messageId,
      ),
    ).toEqual(firstReceipt);
    expect(
      duplicateAcknowledgments.some(
        (batch) =>
          batch.status === "read" &&
          batch.messageIds.includes(unread.messageId),
      ),
    ).toBe(true);
    const after = await snapshot();
    expect(after.conversation).toEqual(before.conversation);
    expect(after.messages).toEqual(before.messages);
    for (const original of read.receipts) {
      const current = after.receipts.find(
        (receipt) => receipt.messageId === original.messageId,
      );
      expect(current?.deliveredAt).toBe(original.deliveredAt);
      if (original.readAt !== null)
        expect(current?.readAt).toBe(original.readAt);
      expect(current?.recipientId).toBe(fixture.bob.id);
    }
    expect(acknowledgments.some((batch) => batch.status === "delivered")).toBe(
      true,
    );
    expect(acknowledgments.some((batch) => batch.status === "read")).toBe(true);
    expect(
      acknowledgments.every((batch) => batch.messageIds.length <= 50),
    ).toBe(true);
    await expect.poll(() => events.frames.length).toBeGreaterThan(0);
    console.log(
      JSON.stringify({
        case: "marks-visibility",
        nativeBrowserVersion: nativeRecipient.version,
        background: { visibility: "hidden", focused: false },
        foreground: { visibility: "visible", focused: true },
        acknowledgments,
        duplicateAcknowledgments,
        events: events.frames,
        persisted: after,
      }),
    );
  } finally {
    duplicateRelease.resolve();
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});

test("marks lost receipt WS recovers old canonical history on reconnect and refresh without polling", async ({
  page,
  browser,
  proxy,
}) => {
  test.setTimeout(90000);
  const fixture = await startChatFixture();
  const peer = await browser.newContext({
    proxy,
    ignoreHTTPSErrors: true,
    locale: "en-US",
  });
  const bob = await peer.newPage();
  const drop = { current: true };
  const events = await observeReceiptEvents(page, drop);
  try {
    await loginChatUser(page, fixture.alice);
    const url = await openChat(page, fixture.bob.username);
    await page
      .getByTestId("message-composer")
      .fill("Marks lost WS old canonical message");
    await page.getByTestId("message-composer").press("Enter");
    await expect(page.locator('[data-message-mark="sent"]')).toHaveCount(1);
    await loginChatUser(bob, fixture.bob);
    await bob.goto(url);
    await bob.bringToFront();
    await bob.getByTestId("message-composer").focus();
    const snapshot = () =>
      readMarks({ fixtureUrl: fixture.url, conversationUrl: url });
    await expect
      .poll(async () => (await snapshot()).receipts[0]?.readAt ?? null)
      .not.toBeNull();
    await expect.poll(() => events.frames.length).toBeGreaterThan(0);
    await expect(page.locator('[data-message-mark="sent"]')).toHaveCount(1);
    const canonical = await snapshot();
    const generations = events.generations();
    const subscriptionCount = events.subscriptions.length;
    const ticket = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/realtime/ticket" &&
        response.status() === 200,
    );
    const history = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api${new URL(url).pathname}/messages` &&
        response.request().method() === "GET" &&
        response.status() === 200,
    );
    drop.current = false;
    await events.disconnect();
    await Promise.all([ticket, history]);
    await expect.poll(events.generations).toBeGreaterThan(generations);
    await expect
      .poll(() => events.subscriptions.length)
      .toBeGreaterThan(subscriptionCount);
    await expect(page.locator('[data-message-mark="read"]')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('[data-message-mark="read"]')).toHaveCount(1);
    expect((await snapshot()).receipts).toEqual(canonical.receipts);
    console.log(
      JSON.stringify({
        case: "marks-lost-ws",
        events: events.frames,
        subscriptions: events.subscriptions,
        persisted: canonical,
      }),
    );
  } finally {
    await peer.close();
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});

test("marks saved response loss stays unknown until canonical recovery; terminal refusal and actor-switch late receipt are isolated", async ({
  page,
  browser,
  proxy,
}) => {
  test.setTimeout(120000);
  const fixture = await startChatFixture();
  const peer = await browser.newContext({
    proxy,
    ignoreHTTPSErrors: true,
    locale: "en-US",
  });
  const bob = await peer.newPage();
  const release = Promise.withResolvers<void>();
  const held = Promise.withResolvers<Awaited<ReturnType<typeof readMarks>>>();
  const transport = { suppressCreated: true };
  try {
    await page.routeWebSocket(
      (url) => url.pathname === "/event/",
      (route) => {
        const server = route.connectToServer();
        route.onMessage((frame) => server.send(frame));
        server.onMessage((frame) => {
          if (
            transport.suppressCreated &&
            typeof frame === "string" &&
            frame.includes('"messages.created"')
          )
            return;
          route.send(frame);
        });
      },
    );
    await loginChatUser(page, fixture.alice);
    const url = await openChat(page, fixture.bob.username);
    const messagePath = `**/api${new URL(url).pathname}/messages`;
    const attempts = { count: 0 };
    await page.route(messagePath, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      attempts.count++;
      if (attempts.count === 1) await route.fetch();
      await route.abort("connectionfailed");
    });
    await page
      .getByTestId("message-composer")
      .fill("Marks saved response lost");
    await page.getByTestId("message-composer").press("Enter");
    const snapshot = () =>
      readMarks({ fixtureUrl: fixture.url, conversationUrl: url });
    await expect.poll(async () => (await snapshot()).messages.length).toBe(1);
    await expect(page.locator('[data-message-mark="waiting"]')).toHaveCount(1);
    transport.suppressCreated = false;
    await page.unroute(messagePath);
    await page.reload();
    await expect(page.locator('[data-message-mark="sent"]')).toHaveCount(1);
    expect((await snapshot()).messages).toHaveLength(1);
    await page.route(messagePath, (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({
              ok: false,
              error: { code: "CONVERSATION_FORBIDDEN" },
            }),
          })
        : route.continue(),
    );
    await page.getByTestId("message-composer").fill("Marks terminal refusal");
    await page.getByTestId("message-composer").press("Enter");
    await expect(page.locator('[data-message-mark="error"]')).toHaveCount(1);
    expect((await snapshot()).messages).toHaveLength(1);
    await loginChatUser(bob, fixture.bob);
    await bob.route(
      `**/api${new URL(url).pathname}/receipts`,
      async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        held.resolve(await snapshot());
        await release.promise;
        await route.fulfill({ response });
      },
    );
    await bob.goto(url);
    await bob.bringToFront();
    await bob.getByTestId("message-composer").focus();
    const beforeSwitch = await held.promise;
    expect(beforeSwitch.receipts).toHaveLength(1);
    expect(beforeSwitch.receipts[0]).toMatchObject({
      messageId: beforeSwitch.messages[0]?._id,
      recipientId: fixture.bob.id,
      deliveredAt: expect.any(Number),
    });
    await logoutUser(bob);
    await expect(
      bob
        .getByRole("banner")
        .getByRole("link", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await loginChatUser(bob, fixture.mallory);
    release.resolve();
    await bob.unrouteAll({ behavior: "wait" });
    await bob.goto(url);
    const session = await (
      await bob.request.get("https://localhost/api/session")
    ).json();
    expect(session.data.userId).toBe(fixture.mallory.id);
    const denied = await bob.request.get(
      `https://localhost/api${new URL(url).pathname}/messages`,
      {
        headers: {
          "X-Expected-Owner-ID": session.data.userId,
          "X-Expected-Login-Generation": session.data.generation,
        },
      },
    );
    expect(denied.status()).toBe(403);
    await expect(bob.getByTestId("message-list")).not.toContainText(
      "Marks saved response lost",
    );
    await expect(bob.locator("[data-message-mark]")).toHaveCount(0);
    const final = await snapshot();
    expect(final.receipts).toEqual(beforeSwitch.receipts);
    expect(final.messages).toHaveLength(1);
    console.log(
      JSON.stringify({
        case: "marks-response-loss-actor-switch",
        attempts: attempts.count,
        persisted: final,
      }),
    );
  } finally {
    release.resolve();
    await peer.close();
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});
