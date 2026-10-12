import type { Locator, Page } from "@playwright/test";
import { logoutUser } from "../../fixtures/auth05/ui";
import { expect, test } from "../../fixtures/browser-egress/test";
import { startChatFixture } from "../../fixtures/chat05/browser";
import { loginChatUser, openChat } from "../../fixtures/chat05/ui";
import { withResource } from "../../fixtures/lifecycle/with-resource";
import {
  controlSessionFault,
  currentSessionCookie,
  loginMainUser,
  startSessionFaultFixture,
} from "../auth/lib/faults";

test("guest_header_has_one_sign_in_and_registration_inside_dialog", async ({
  page,
}) => {
  await page.goto("https://localhost");
  const header = page.getByRole("banner");
  await expect(
    header.getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveCount(1);
  await expect(
    header.getByRole("link", { name: /Sign up|Create account/ }),
  ).toHaveCount(0);
  await header.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("menuitem", { name: "Language", exact: true }).click();
  const language = page.getByRole("dialog", { name: "Language", exact: true });
  await language.getByRole("button", { name: "Русский", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await page
    .getByRole("dialog", { name: "Язык", exact: true })
    .getByRole("button", { name: "Закрыть", exact: true })
    .click();
  const signIn = header.getByRole("link", { name: "Войти", exact: true });
  await expect(signIn).toHaveAttribute("href", "/?mode=login");
  await signIn.click();
  const auth = page.getByRole("dialog", { name: "Войти", exact: true });
  await expect(auth).toBeVisible();
  await auth
    .getByRole("link", { name: "Нет аккаунта? Создать аккаунт", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Создать аккаунт", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(signIn).toBeFocused();
});

test("member_avatar_menu_owns_language_privacy_support_and_logout", async ({
  page,
}) => {
  await withResource({
    start: () => startChatFixture(),
    use: async (fixture) => {
      try {
        await loginChatUser(page, fixture.alice);
        await page.goto("https://localhost/");
        await expect(page).toHaveURL("https://localhost/conversations");
        const header = page.getByRole("banner");
        const menu = header.getByRole("button", {
          name: `Account menu: ${fixture.alice.username}`,
          exact: true,
        });
        await expect(
          header.getByRole("button", { name: "Sign out", exact: true }),
        ).toHaveCount(0);
        await expect(
          header.getByRole("button", { name: "Русский", exact: true }),
        ).toHaveCount(0);
        await expectHeaderRoutes({
          page,
          header,
          menu,
          username: fixture.alice.username,
        });
        await menu.click();
        await expect(page.getByRole("menu")).toContainText(
          fixture.alice.username,
        );
        await expect(
          page.getByRole("menuitem", { name: "Cookie settings", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("menuitem", { name: "Report a problem", exact: true }),
        ).toBeVisible();
        await page
          .getByRole("menuitem", { name: "Language", exact: true })
          .click();
        await page
          .getByRole("dialog", { name: "Language", exact: true })
          .getByRole("button", { name: "Русский", exact: true })
          .click();
        await page.keyboard.press("Escape");
        const russianMenu = header.getByRole("button", {
          name: `Меню аккаунта: ${fixture.alice.username}`,
          exact: true,
        });
        await expect(russianMenu).toBeFocused();
        await russianMenu.click();
        const response = page.waitForResponse(
          (value) =>
            value.request().method() === "POST" &&
            new URL(value.url()).pathname === "/",
        );
        await page
          .getByRole("menuitem", { name: "Выйти", exact: true })
          .click();
        await (await response).finished();
        await expect(header.getByTestId("current-actor")).toHaveCount(0);
        await expect(
          header.getByRole("link", { name: "Войти", exact: true }),
        ).toBeVisible();
      } finally {
        test.setTimeout(test.info().timeout + 20000);
      }
    },
  });
});

test("header_survives_no_js_and_ru_320px", async ({ browser, proxy }) => {
  await withResource({
    start: async () => {
      const context = await browser.newContext({
        proxy,
        ignoreHTTPSErrors: true,
        javaScriptEnabled: false,
        locale: "ru-RU",
        viewport: { width: 320, height: 800 },
      });
      return { context, dispose: () => context.close() };
    },
    use: async ({ context }) => {
      const page = await context.newPage();
      for (const path of ["/", "/?mode=login", "/conversations"]) {
        await page.goto(`https://localhost${path}`);
        const header = page.getByRole("banner");
        const signIn = header.getByRole("link", { name: "Войти", exact: true });
        await expect(signIn).toBeVisible();
        await expect(
          header.getByRole("link", { name: "Создать аккаунт", exact: true }),
        ).toHaveCount(0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const bounds = await signIn.boundingBox();
        expect(bounds?.height).toBeGreaterThanOrEqual(44);
      }
      await page.goto("https://localhost/?mode=login");
      await page
        .getByRole("link", {
          name: "Нет аккаунта? Создать аккаунт",
          exact: true,
        })
        .click();
      await expect(page).toHaveURL("https://localhost/?mode=register");
      await expect(
        page.getByRole("textbox", { name: "Твоя почта", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("banner")
        .getByRole("link", { name: "Войти", exact: true })
        .click();
      await expect(page).toHaveURL("https://localhost/?mode=login");
      await expect(page.getByLabel("Пароль", { exact: true })).toBeVisible();
    },
  });
});

test("pending_logout_and_late_S1_receipt_preserve_S2_header_and_private_body", async ({
  page,
  context,
}) => {
  await withResource({
    start: () => startSessionFaultFixture(),
    use: async (fixture) => {
      const reached = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      try {
        await withResource({
          start: async () => ({
            dispose: async () => {
              release.resolve();
              await page.unrouteAll({ behavior: "wait" });
            },
          }),
          use: async () => {
            await loginMainUser(page, fixture.account);
            const header = page.getByRole("banner");
            const firstActor = await header
              .getByTestId("current-actor")
              .innerText();
            const cookie = await currentSessionCookie(context);
            await page.route("https://localhost/", async (route) => {
              if (route.request().method() !== "POST") return route.continue();
              const response = await route.fetch({
                url: `${fixture.url}/logout-form`,
                headers: {
                  ...(await route.request().allHeaders()),
                  cookie,
                  origin: "https://localhost",
                },
              });
              expect(response.headers()["set-cookie"]).toBeUndefined();
              reached.resolve();
              await release.promise;
              await route.fulfill({ response });
            });
            const completed = page.waitForResponse(
              (response) =>
                response.request().method() === "POST" &&
                new URL(response.url()).pathname === "/",
            );
            await header
              .getByRole("button", { name: /^Account menu:/ })
              .click();
            await page
              .getByRole("menuitem", { name: "Sign out", exact: true })
              .click();
            await reached.promise;
            await expect(
              header.getByRole("button", { name: "Signing out…", exact: true }),
            ).toBeDisabled();
            await expect(
              header.getByRole("link", { name: "Sign in", exact: true }),
            ).toHaveCount(0);
            await expect(
              page
                .locator("main")
                .getByRole("heading", { name: firstActor, exact: true }),
            ).toHaveCount(0);
            const login = await page.request.post(
              "https://localhost/api/auth/login",
              {
                headers: { origin: "https://localhost" },
                data: fixture.secondAccount,
              },
            );
            expect(login.status()).toBe(200);
            await page.evaluate(() => window.dispatchEvent(new Event("focus")));
            await expect(header.getByTestId("current-actor")).toBeVisible();
            const secondActor = await header
              .getByTestId("current-actor")
              .innerText();
            expect(secondActor).not.toBe(firstActor);
            release.resolve();
            await (await completed).finished();
            await expect(header.getByTestId("current-actor")).toHaveText(
              secondActor,
            );
            await expect(
              header.getByRole("link", { name: "Sign in", exact: true }),
            ).toHaveCount(0);
            await expect(
              page.locator("main").getByRole("heading", { level: 1 }),
            ).toHaveText(secondActor);
            await expect(
              page
                .locator("main")
                .getByRole("heading", { name: firstActor, exact: true }),
            ).toHaveCount(0);
          },
        });
      } finally {
        test.setTimeout(test.info().timeout + 20000);
      }
    },
  });
});

test("unavailable_session_header_does_not_claim_guest_or_successful_logout", async ({
  page,
  context,
}) => {
  await withResource({
    start: () => startSessionFaultFixture(),
    use: async (fixture) => {
      try {
        await withResource({
          start: async () => ({
            dispose: async () => {
              await page.unrouteAll({ behavior: "wait" });
            },
          }),
          use: async () => {
            await loginMainUser(page, fixture.account);
            const cookie = await currentSessionCookie(context);
            await page.route("**/api/session", async (route) => {
              const response = await route.fetch({
                url: `${fixture.url}/session`,
                headers: { ...(await route.request().allHeaders()), cookie },
              });
              await route.fulfill({ response });
            });
            await controlSessionFault({
              page,
              url: fixture.url,
              cookie,
              action: "unknown-refresh",
            });
            await controlSessionFault({
              page,
              url: fixture.url,
              cookie,
              action: "expire-access",
            });
            await page.evaluate(() => window.dispatchEvent(new Event("focus")));
            const header = page.getByRole("banner");
            await expect(header).toContainText(
              "The service is temporarily unavailable.",
            );
            await expect(header.getByTestId("current-actor")).toHaveCount(0);
            await expect(
              header.getByRole("link", { name: "Sign in", exact: true }),
            ).toHaveCount(0);
            await expect(
              header.getByRole("link", { name: "Sign up", exact: true }),
            ).toHaveCount(0);
            await expect(
              header.getByRole("button", { name: "Sign out", exact: true }),
            ).toHaveCount(0);
            await expect(
              page.getByRole("status").filter({ hasText: "Signed out" }),
            ).toHaveCount(0);
          },
        });
      } finally {
        test.setTimeout(test.info().timeout + 20000);
      }
    },
  });
});

const expectHeaderRoutes = async ({
  page,
  header,
  menu,
  username,
}: Readonly<{
  page: Page;
  header: Locator;
  menu: Locator;
  username: string;
}>) => {
  for (const width of [1440, 768, 320]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ["/", "/?mode=login", "/conversations"]) {
      await page.goto(`https://localhost${path}`);
      await expect(header.getByTestId("current-actor")).toHaveText(username);
      await expect(menu).toBeVisible();
      expect((await menu.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      const headerBounds = await header.boundingBox();
      if (!headerBounds) throw new Error("Expected visible header");
      expect(headerBounds.x).toBeGreaterThanOrEqual(0);
      expect(headerBounds.x + headerBounds.width).toBeLessThanOrEqual(width);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
};

test("320px detail header follows cross-tab logout, login and expired cookie without navigation", async ({
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
        await page.setViewportSize({ width: 320, height: 800 });
        const origin = await page.evaluate(() => performance.timeOrigin);
        const header = page.getByRole("banner", { includeHidden: true });
        await expect(header).toBeHidden();
        const signedOut = other.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === "/",
        );
        await logoutUser(other);
        await (await signedOut).finished();
        await expect(header.getByTestId("current-actor")).toHaveCount(0);
        await expect(
          header.getByRole("link", { name: "Sign in", exact: true }),
        ).toBeVisible();
        await expect(page).toHaveURL(detailURL);
        expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
        const bounds = await header.boundingBox();
        if (!bounds)
          throw new Error("Guest detail header missing after cross-tab logout");
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
        await loginChatUser(other, fixture.alice);
        await expect(header.getByTestId("current-actor")).toHaveText(
          fixture.alice.username,
        );
        await expect(header).toBeHidden();
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
        await expect(page).toHaveURL(detailURL);
        expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
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
