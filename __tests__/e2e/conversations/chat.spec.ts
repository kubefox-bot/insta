import { loginUser as login, logoutUser } from "../../fixtures/auth05/ui";
import { expect, test } from "../../fixtures/browser-egress/test";
import { startChatFixture } from "../../fixtures/chat05/browser";
import { ageOwnedQueue } from "../../fixtures/chat05/queue";
import { withResource } from "../../fixtures/lifecycle/with-resource";

test("E05/E06/E09 actual two users, Mallory, SSR no-store, offline durable send/reconnect, mobile navigation", async ({
  browser,
  proxy,
  page,
  context,
}) => {
  test.setTimeout(90000);
  await withResource({
    start: startChatFixture,
    use: async (fixture) => {
      await withResource({
        start: async () => {
          const bobContext = await browser.newContext({
            proxy,
            ignoreHTTPSErrors: true,
            locale: "en-US",
          });
          return { context: bobContext, dispose: () => bobContext.close() };
        },
        use: async ({ context: bobContext }) => {
          const bob = await bobContext.newPage();
          await withResource({
            start: async () => {
              const malloryContext = await browser.newContext({
                proxy,
                ignoreHTTPSErrors: true,
                locale: "en-US",
              });
              return {
                context: malloryContext,
                dispose: () => malloryContext.close(),
              };
            },
            use: async ({ context: malloryContext }) => {
              const mallory = await malloryContext.newPage();
              await login(page, fixture.alice);
              await login(bob, fixture.bob);
              await login(mallory, fixture.mallory);
              await page.goto("https://localhost/conversations");
              await page.getByRole("searchbox").fill(fixture.bob.username);
              await page
                .getByRole("button", { name: "Search", exact: true })
                .click();
              await page
                .getByRole("button", {
                  name: fixture.bob.username,
                  exact: true,
                })
                .click();
              await expect(page).toHaveURL(/\/conversations\/[a-f0-9]{24}$/);
              const url = page.url();
              const conversationId = new URL(url).pathname.split("/").at(-1);
              if (!conversationId)
                throw new Error("Expected actual dialogue ID");
              await bob.goto(url);
              await expect(bob.getByTestId("message-composer")).toBeVisible();
              const initial = await page.request.get(url);
              expect(initial.headers()["cache-control"]).toBe("no-store");
              expect(await initial.text()).not.toContain("accessToken");
              await page.getByTestId("message-composer").fill("Hello Bob");
              await page.getByTestId("message-composer").press("Enter");
              await expect(
                bob
                  .getByTestId("message-list")
                  .getByText("Hello Bob", { exact: true }),
              ).toHaveCount(1);
              await expect(
                page
                  .getByTestId("message-list")
                  .getByText("Hello Bob", { exact: true }),
              ).toHaveCount(1);
              await bob.getByTestId("message-composer").fill("line1");
              await bob.getByTestId("message-composer").press("Shift+Enter");
              await bob
                .getByTestId("message-composer")
                .pressSequentially("line2");
              await expect(bob.getByTestId("message-composer")).toHaveValue(
                "line1\nline2",
              );
              await bob.getByTestId("message-composer").press("Enter");
              await expect(page.getByTestId("message-list")).toContainText(
                "line1\nline2",
              );
              await mallory.goto(url);
              await expect(
                mallory.getByTestId("message-list"),
              ).not.toContainText("Hello Bob");
              const session = await (
                await mallory.request.get("https://localhost/api/session")
              ).json();
              const denied = await mallory.request.get(
                `https://localhost/api/conversations/${conversationId}/messages`,
                {
                  headers: {
                    "X-Expected-Owner-ID": session.data.userId,
                    "X-Expected-Login-Generation": session.data.generation,
                  },
                },
              );
              expect(denied.status()).toBe(403);
              await context.setOffline(true);
              await page.getByTestId("message-composer").fill("Offline queued");
              await page.getByTestId("message-composer").press("Enter");
              await expect(page.getByTestId("pending-message")).toContainText(
                "Offline queued",
              );
              await context.setOffline(false);
              await expect(
                bob
                  .getByTestId("message-list")
                  .getByText("Offline queued", { exact: true }),
              ).toHaveCount(1);
              await expect(page.getByTestId("pending-message")).toHaveCount(0);
              await page.setViewportSize({ width: 390, height: 844 });
              await expect(
                page.getByRole("link", { name: "Back", exact: true }),
              ).toBeVisible();
              await page
                .getByRole("link", { name: "Back", exact: true })
                .click();
              await expect(page.getByTestId("conversation-link")).toBeVisible();
              await page.getByTestId("conversation-link").click();
              await expect(page.getByTestId("message-list")).toContainText(
                "Offline queued",
              );
              await logoutUser(page);
              await expect(page.getByTestId("message-list")).toHaveCount(0);
            },
          });
        },
      });
    },
  });
});
test("A14 real Mongo commit barrier after SSR snapshot and actual subscribe ACK buffers and deduplicates canonical event", async ({
  page,
}) => {
  test.setTimeout(90000);
  const fixture = await startChatFixture();
  const release = Promise.withResolvers<void>();
  try {
    await login(page, fixture.alice);
    await page.goto("https://localhost/conversations");
    await page.getByRole("searchbox").fill(fixture.bob.username);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page
      .getByRole("button", { name: fixture.bob.username, exact: true })
      .click();
    await expect(page).toHaveURL(/\/conversations\/[a-f0-9]{24}$/);
    const url = page.url();
    const conversationId = new URL(url).pathname.split("/").at(-1);
    const held = await fetch(`${fixture.url}/late-start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId }),
    });
    expect(held.status).toBe(200);
    await held.body?.cancel();
    const snapshot = Promise.withResolvers<void>();
    await page.route(
      `**/api/conversations/${conversationId}/messages?after=0`,
      async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        expect(body.data.items).toEqual([]);
        snapshot.resolve();
        await release.promise;
        await route.fulfill({ response });
      },
    );
    await page.reload();
    await snapshot.promise;
    expect(
      await page
        .getByTestId("message-list")
        .getByText("A14 late persisted commit")
        .count(),
    ).toBe(0);
    const committed = await fetch(`${fixture.url}/late-release`, {
      method: "POST",
    });
    expect(committed.status).toBe(200);
    await committed.body?.cancel();
    release.resolve();
    await expect(
      page
        .getByTestId("message-list")
        .getByText("A14 late persisted commit", { exact: true }),
    ).toHaveCount(1);
    await page.reload();
    await expect(
      page
        .getByTestId("message-list")
        .getByText("A14 late persisted commit", { exact: true }),
    ).toHaveCount(1);
  } finally {
    release.resolve();
    await page.unrouteAll({ behavior: "wait" });
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});
test("E06/E07 actual queue survives reload, age requires explicit confirmation and logout removes owned pending text", async ({
  page,
  context,
  browser,
  proxy,
}) => {
  test.setTimeout(90000);
  const fixture = await startChatFixture();
  const bobContext = await browser.newContext({
    proxy,
    ignoreHTTPSErrors: true,
    locale: "en-US",
  });
  const bob = await bobContext.newPage();
  try {
    await login(page, fixture.alice);
    await login(bob, fixture.bob);
    await page.goto("https://localhost/conversations");
    await page.getByRole("searchbox").fill(fixture.bob.username);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page
      .getByRole("button", { name: fixture.bob.username, exact: true })
      .click();
    await expect(page).toHaveURL(/\/conversations\/[a-f0-9]{24}$/);
    const url = page.url();
    await bob.goto(url);
    await context.setOffline(true);
    await page.getByTestId("message-composer").fill("Aged pending draft");
    await page.getByTestId("message-composer").press("Enter");
    await expect(page.getByTestId("pending-message")).toContainText(
      "Aged pending draft",
    );
    const keys = await ageOwnedQueue({ page, ownerId: fixture.alice.id });
    expect(keys).toHaveLength(1);
    await context.setOffline(false);
    await page.reload();
    await expect(
      page
        .getByTestId("pending-message")
        .getByRole("button", { name: "Send pending messages", exact: true }),
    ).toBeVisible();
    expect(
      await bob
        .getByTestId("message-list")
        .getByText("Aged pending draft", { exact: true })
        .count(),
    ).toBe(0);
    await page
      .getByTestId("pending-message")
      .getByRole("button", { name: "Send pending messages", exact: true })
      .click();
    await expect(
      bob
        .getByTestId("message-list")
        .getByText("Aged pending draft", { exact: true }),
    ).toHaveCount(1);
    await context.setOffline(true);
    await page
      .getByTestId("message-composer")
      .fill("Logout removes this pending text");
    await page.getByTestId("message-composer").press("Enter");
    await expect(page.getByTestId("pending-message")).toContainText(
      "Logout removes this pending text",
    );
    await ageOwnedQueue({ page, ownerId: fixture.alice.id });
    await context.setOffline(false);
    await page.reload();
    await expect(
      page
        .getByTestId("pending-message")
        .getByRole("button", { name: "Send pending messages", exact: true }),
    ).toBeVisible();
    await logoutUser(page);
    await expect(
      page
        .getByRole("banner")
        .getByRole("link", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await login(page, fixture.alice);
    await page.goto(url);
    await expect(page.getByTestId("pending-message")).toHaveCount(0);
    expect(
      await bob
        .getByTestId("message-list")
        .getByText("Logout removes this pending text", { exact: true })
        .count(),
    ).toBe(0);
  } finally {
    await context.setOffline(false);
    await bobContext.close();
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});

test("explicit username search: Enter/button, stable loading, clear pending, keyboard choice and compact targets", async ({
  page,
}) => {
  test.setTimeout(90000);
  const fixture = await startChatFixture();
  const release = Promise.withResolvers<void>();
  let requests = 0;
  try {
    await login(page, fixture.alice);
    await page.goto("https://localhost/conversations");
    await page.setViewportSize({ width: 320, height: 844 });
    await page
      .getByRole("button", { name: "Necessary cookies only", exact: true })
      .click();
    await page.route("**/api/users?*", async (route) => {
      const ordinal = ++requests;
      const response = await route.fetch();
      if (ordinal === 1) await release.promise;
      await route.fulfill({ response });
    });
    const search = page.getByTestId("user-search");
    const field = search.getByRole("searchbox", {
      name: "Search by username",
      exact: true,
    });
    const submit = search.getByRole("button", { name: "Search", exact: true });
    const clear = search.getByRole("button", {
      name: "Clear search",
      exact: true,
    });
    await field.fill(fixture.mallory.username);
    expect(requests).toBe(0);
    const before = await submit.boundingBox();
    if (!before) throw new Error("Search button is missing");
    for (const target of [field, submit, clear]) {
      const bounds = await target.boundingBox();
      if (!bounds) throw new Error("Search touch target is missing");
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    await field.press("Enter");
    await expect.poll(() => requests).toBe(1);
    await expect(submit).toHaveAttribute("aria-busy", "true");
    await expect(search.getByRole("status")).toHaveText("Loading…");
    const loading = await submit.boundingBox();
    if (!loading) throw new Error("Loading search button is missing");
    expect(loading.width).toBe(before.width);
    expect(loading.height).toBe(before.height);
    await field.press("Enter");
    expect(requests).toBe(1);
    await clear.focus();
    await clear.press("Enter");
    await expect(field).toHaveValue("");
    await expect(field).toBeFocused();
    await expect(search.getByRole("status")).toHaveCount(0);
    release.resolve();
    await page.keyboard.type(fixture.bob.username);
    await expect(field).toHaveValue(fixture.bob.username);
    expect(requests).toBe(1);
    await submit.click();
    const choice = search.getByRole("button", {
      name: fixture.bob.username,
      exact: true,
    });
    await expect(choice).toBeVisible();
    await expect(
      search.getByRole("button", {
        name: fixture.mallory.username,
        exact: true,
      }),
    ).toHaveCount(0);
    expect(requests).toBe(2);
    const resultBounds = await choice.boundingBox();
    if (!resultBounds) throw new Error("Search result is missing");
    expect(resultBounds.height).toBeGreaterThanOrEqual(44);
    await choice.focus();
    await choice.press("Enter");
    await expect(page).toHaveURL(/\/conversations\/[a-f0-9]{24}$/);
  } finally {
    release.resolve();
    await page.unrouteAll({ behavior: "wait" });
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});
