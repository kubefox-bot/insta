import { expect, test } from "../../fixtures/browser-egress/test";
import { startChatFixture } from "../../fixtures/chat05/browser";
import { loginChatUser, openChat } from "../../fixtures/chat05/ui";
import { loginOutbox } from "../../fixtures/outbox/setup";

test("CORE I5 Bob discovers incoming dialogue from mounted list and opens it through UI", async ({
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
  try {
    await loginChatUser(bob, fixture.bob);
    await bob.goto("https://localhost/conversations");
    await expect(bob.getByTestId("conversation-link")).toHaveCount(0);
    await loginChatUser(page, fixture.alice);
    await openChat(page, fixture.bob.username);
    await page.getByTestId("message-composer").fill("CORE new incoming");
    await page.getByTestId("message-composer").press("Enter");
    await bob.bringToFront();
    await expect(bob.getByTestId("conversation-link")).toHaveCount(1, {
      timeout: 25000,
    });
    await bob.getByTestId("conversation-link").click();
    await expect(bob.getByTestId("message-list")).toContainText(
      "CORE new incoming",
    );
  } finally {
    await peer.close();
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});

test("CORE I3 I4 unsent draft survives transient unknown session while private UI closes, new login clears draft and restores list", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const fixture = await startChatFixture();
  const other = await context.newPage();
  const listCaptured = Promise.withResolvers<void>();
  const releaseList = Promise.withResolvers<void>();
  const listSettled = Promise.withResolvers<void>();
  const sent: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/api\/conversations\/[^/]+\/messages$/.test(request.url())
    )
      sent.push(request.url());
  });
  try {
    await loginChatUser(page, fixture.alice);
    await openChat(page, fixture.bob.username);
    await page.getByTestId("message-composer").fill("CORE unsent owned draft");
    await page.route("**/api/session", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: { code: "SESSION_UNAVAILABLE" },
        }),
      }),
    );
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByTestId("message-composer")).toHaveCount(0);
    await expect
      .soft(page.getByTestId("support-error-code"))
      .toHaveText("SESSION_UNAVAILABLE");
    expect(sent).toEqual([]);
    await page.unroute("**/api/session");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByTestId("message-composer")).toHaveValue(
      "CORE unsent owned draft",
    );
    await expect(page.getByTestId("conversation-link")).toHaveCount(1);
    expect(sent).toEqual([]);
    await loginOutbox(other, {
      email: fixture.alice.email,
      password: fixture.alice.password,
    });
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByTestId("message-composer")).toHaveValue("");
    await expect(page.getByTestId("conversation-link")).toHaveCount(1);
    await page
      .getByTestId("message-composer")
      .fill("CORE must not cross accounts");
    await page.route("**/api/conversations", async (route) => {
      if (
        route.request().method() !== "GET" ||
        route.request().headers()["x-expected-owner-id"] !== fixture.alice.id
      ) {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      expect((await response.json()).data.items).toHaveLength(1);
      listCaptured.resolve();
      await releaseList.promise;
      await route.fulfill({ response });
      listSettled.resolve();
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await listCaptured.promise;
    await loginOutbox(other, {
      email: fixture.mallory.email,
      password: fixture.mallory.password,
    });
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByTestId("current-actor")).toHaveText(
      fixture.mallory.username,
    );
    await expect(page.getByTestId("conversation-link")).toHaveCount(0);
    releaseList.resolve();
    await listSettled.promise;
    await expect(page.getByTestId("conversation-link")).toHaveCount(0);
    await expect(page.getByTestId("message-composer")).toHaveValue("");
    expect(sent).toEqual([]);
  } finally {
    releaseList.resolve();
    await page.unrouteAll({ behavior: "wait" });
    await other.close();
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});

test("CORE M1 terminal queue entry explains failure and never offers confirmation resume", async ({
  page,
}) => {
  test.setTimeout(60000);
  const fixture = await startChatFixture();
  try {
    await loginChatUser(page, fixture.alice);
    await openChat(page, fixture.bob.username);
    await page.route("**/api/conversations/*/messages", (route) =>
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
    await page.getByTestId("message-composer").fill("CORE terminal synthetic");
    await page.getByTestId("message-composer").press("Enter");
    const record = page.getByTestId("pending-message");
    await expect(record).toContainText("CONVERSATION_FORBIDDEN");
    await expect(record).toContainText("Message could not be sent");
    await expect(
      record.getByRole("button", {
        name: "Send pending messages",
        exact: true,
      }),
    ).toHaveCount(0);
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});
