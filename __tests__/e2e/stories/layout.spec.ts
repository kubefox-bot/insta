import { expect, test } from "../../fixtures/browser-egress/test";

test("compact guest story action stays below Header and keeps the document within 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("https://localhost/");
  const strip = page.getByRole("region", { name: "Stories", exact: true });
  await expect(strip).toBeVisible();
  await expect(
    strip.getByRole("button", { name: "Add a story", exact: true }),
  ).toBeVisible();
  const header = await page.getByRole("banner").boundingBox();
  const rail = await strip.boundingBox();
  if (!header || !rail) throw Error("Guest header and rail missing");
  expect(header.y + header.height).toBeLessThanOrEqual(rail.y);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

import { logoutUser } from "../../fixtures/auth05/ui";
import { startChatFixture } from "../../fixtures/chat05/browser";
import { loginChatUser, openChat } from "../../fixtures/chat05/ui";
import { withResource } from "../../fixtures/lifecycle/with-resource";
import { startStoryFixture } from "../../fixtures/stories/browser";
import { publishFixtureStories, rejectAutoplay } from "./lib/publication";

test("authenticated rail belongs to desktop sidebar and mobile list, never visible in mobile detail", async ({
  page,
}) => {
  test.setTimeout(90000);
  await withResource({
    start: startChatFixture,
    use: async (fixture) => {
      await loginChatUser(page, fixture.alice);
      await openChat(page, fixture.bob.username);
      const strip = page.getByRole("region", { name: "Stories", exact: true });
      for (const width of [1440, 768, 769]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(
          page
            .getByTestId("conversation-sidebar")
            .getByRole("region", { name: "Stories", exact: true }),
        ).toBeVisible();
        await expect(
          page
            .getByTestId("conversation-panel")
            .getByRole("region", { name: "Stories", exact: true }),
        ).toHaveCount(0);
        await expect(
          strip.getByRole("button", { name: "Refresh stories", exact: true }),
        ).toHaveCount(0);
      }
      for (const width of [767, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(strip).toBeHidden();
      }
      await page.goto("https://localhost/conversations");
      await expect(strip).toBeVisible();
      await expect(
        strip.getByRole("button", { name: "Add a story", exact: true }),
      ).toBeVisible();
    },
  });
});

test("public circles and native player fit 320/740/1440, keyboard, reduced motion and chat layout", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await withResource({
    start: startStoryFixture,
    use: async (fixture) => {
      const { author } = await publishFixtureStories({
        page,
        account: fixture.account,
      });
      await publishFixtureStories({
        page,
        account: fixture.secondAccount,
        count: 1,
      });
      await rejectAutoplay(page);
      await page.emulateMedia({ reducedMotion: "reduce" });
      for (const width of [320, 740, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("https://localhost/");
        const strip = page.getByRole("region", {
          name: "Stories",
          exact: true,
        });
        const header = await page.getByRole("banner").boundingBox();
        const rail = await strip.boundingBox();
        if (!header || !rail) throw Error("Guest header and rail missing");
        expect(header.y + header.height).toBeLessThanOrEqual(rail.y);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const circle = strip.getByRole("button", {
          name: `Watch stories by ${author.username}`,
          exact: true,
        });
        expect(
          await circle
            .locator("span")
            .first()
            .evaluate((node) => node.getBoundingClientRect().width),
        ).toBe(48);
        await page.screenshot({
          path: `.infra/stories-task6/${info.project.name}-home-${width}.png`,
        });
        await circle.focus();
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog", {
          name: author.username,
          exact: true,
        });
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByRole("button", { name: "Play", exact: true }),
        ).toBeVisible();
        const bounds = await dialog.boundingBox();
        expect(bounds?.x).toBeGreaterThanOrEqual(0);
        expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
          width,
        );
        expect(
          await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
        ).toBe(true);
        await page.keyboard.press("Tab");
        expect(
          await dialog.evaluate((node) =>
            node.contains(document.activeElement),
          ),
        ).toBe(true);
        await page.screenshot({
          path: `.infra/stories-task6/${info.project.name}-player-${width}.png`,
        });
        await page.keyboard.press("Escape");
        await expect(circle).toBeFocused();
        await page.goto("https://localhost/conversations");
        await expect(strip).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: `.infra/stories-task6/${info.project.name}-chat-${width}.png`,
        });
      }
      await page.goto("https://localhost/");
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page
        .getByRole("menuitem", { name: "Language", exact: true })
        .click();
      await page.getByRole("button", { name: "Русский", exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("region", { name: "Сториз", exact: true }),
      ).toBeVisible();
      for (const width of [320, 740, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.screenshot({
          path: `.infra/stories-task6/${info.project.name}-ru-home-${width}.png`,
        });
        const circle = page.getByRole("button", {
          name: `Посмотреть сториз: ${author.username}`,
          exact: true,
        });
        await circle.click();
        const dialog = page.getByRole("dialog", {
          name: author.username,
          exact: true,
        });
        await expect(
          dialog.getByRole("button", { name: "Воспроизвести", exact: true }),
        ).toBeVisible();
        await page.screenshot({
          path: `.infra/stories-task6/${info.project.name}-ru-player-${width}.png`,
        });
        await page.keyboard.press("Escape");
        await expect(circle).toBeFocused();
      }
    },
  });
});

test("unavailable/retry is distinct from empty and retains the plus without blocking main", async ({
  page,
}) => {
  const state = { fail: true };
  await page.route("**/api/stories", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    if (state.fail) {
      await route.fulfill({ status: 503, body: "unavailable" });
      return;
    }
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: { ...(await response.json()), data: { authors: [], cursor: null } },
    });
  });
  try {
    await page.goto("https://localhost/");
    const strip = page.getByRole("region", { name: "Stories", exact: true });
    const main = page.getByRole("main");
    const before = await main.boundingBox();
    await expect(strip.getByRole("status")).toHaveText(
      "Could not refresh stories.",
    );
    await expect(
      strip.getByRole("button", { name: "Add a story", exact: true }),
    ).toBeVisible();
    state.fail = false;
    await strip.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(strip).toContainText("No active stories yet");
    const after = await main.boundingBox();
    expect(after?.y).toBeLessThanOrEqual(before?.y ?? 0);
    await expect(
      strip.getByRole("button", { name: "Refresh stories", exact: true }),
    ).toHaveCount(0);
  } finally {
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("detail rail has exactly one owner across cross-tab guest login, logout and session expiry at 320px", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await withResource({
    start: startChatFixture,
    use: async (fixture) => {
      const other = await context.newPage();
      try {
        await loginChatUser(page, fixture.alice);
        const detailURL = await openChat(page, fixture.bob.username);
        await other.goto(detailURL);
        await expect(other.getByTestId("current-actor")).toHaveText(
          fixture.alice.username,
        );
        const signedOut = other.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === "/",
        );
        await logoutUser(other);
        await (await signedOut).finished();
        await expect(page.getByTestId("current-actor")).toHaveCount(0);
        // Новый guest SSR snapshot остаётся прежним во время следующего cross-tab login.
        await page.goto(detailURL);
        await page.setViewportSize({ width: 320, height: 800 });
        const origin = await page.evaluate(() => performance.timeOrigin);
        const strip = page.getByRole("region", {
          name: "Stories",
          exact: true,
          includeHidden: true,
        });
        const sidebar = page.getByTestId("conversation-sidebar");
        const header = page.getByRole("banner", { includeHidden: true });
        await expect(strip).toHaveCount(1);
        await expect(strip).toBeVisible();
        await expect(sidebar).toHaveCount(0);
        await expect(
          header.getByRole("link", { name: "Sign in", exact: true }),
        ).toBeVisible();
        await loginChatUser(other, fixture.alice);
        await expect(header.getByTestId("current-actor")).toHaveText(
          fixture.alice.username,
        );
        await expect(strip).toHaveCount(1);
        await expect(
          sidebar.getByRole("region", {
            name: "Stories",
            exact: true,
            includeHidden: true,
          }),
        ).toHaveCount(1);
        await expect(strip).toBeHidden();
        await expect(header).toBeHidden();
        await page.setViewportSize({ width: 768, height: 800 });
        await expect(
          sidebar.getByRole("region", {
            name: "Stories",
            exact: true,
            includeHidden: true,
          }),
        ).toBeVisible();
        await expect(
          page
            .getByTestId("conversation-panel")
            .getByRole("region", { name: "Stories", exact: true }),
        ).toHaveCount(0);
        await page.setViewportSize({ width: 320, height: 800 });
        const cookie = (await context.cookies()).find(
          (value) => value.name === "insta_session",
        );
        if (!cookie)
          throw new Error("Expected owned login cookie before expiry");
        await context.addCookies([
          { ...cookie, expires: Math.floor(Date.now() / 1000) - 1 },
        ]);
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await expect(header.getByTestId("current-actor")).toHaveCount(0);
        await expect(
          header.getByRole("link", { name: "Sign in", exact: true }),
        ).toBeVisible();
        await expect(sidebar).toHaveCount(0);
        await expect(strip).toHaveCount(1);
        await expect(strip).toBeVisible();
        await expect(page).toHaveURL(detailURL);
        expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
        const headerBounds = await header.boundingBox();
        const railBounds = await strip.boundingBox();
        if (!headerBounds || !railBounds)
          throw new Error("Guest header and rail missing after expiry");
        expect(headerBounds.y + headerBounds.height).toBeLessThanOrEqual(
          railBounds.y,
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      } finally {
        await other.close();
        test.setTimeout(test.info().timeout + 20000);
      }
    },
  });
});
