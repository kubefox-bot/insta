import { expect, test } from "../../fixtures/browser-egress/test";

test("CSS shell remains readable in EN/RU mobile/desktop, with reduced motion and slow CPU", async ({
  page,
  context,
}) => {
  const client = await context.newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  try {
    await page.goto("https://localhost");
    for (const width of [375, 767, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    const shellBefore = await page.locator("header,main,footer").count();
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Русский", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await expect(
      page.getByRole("link", { name: "Войти", exact: true }),
    ).toBeVisible();
    expect(await page.locator("header,main,footer").count()).toBe(shellBefore);
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  } finally {
    if (!page.isClosed()) await client.detach();
  }
});
test("SSR native forms work when hydration assets fail; dialog traps keyboard and closes with Escape", async ({
  page,
  browser,
  proxy,
}) => {
  await page.goto("https://localhost");
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("textbox", { name: "Email", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const context = await browser.newContext({
    proxy,
    ignoreHTTPSErrors: true,
    locale: "ru-RU",
  });
  const failed = await context.newPage();
  try {
    await failed.route("**/_app/immutable/**", (route) => route.abort());
    await failed.goto("https://localhost/?mode=login");
    await expect(failed.locator("html")).toHaveAttribute("lang", "ru");
    await expect(
      failed.getByRole("textbox", { name: "Электронная почта", exact: true }),
    ).toBeVisible();
    await expect(failed.getByLabel("Пароль", { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});
test("parallel SSR locales are request scoped", async ({ browser, proxy }) => {
  const english = await browser.newContext({
    proxy,
    ignoreHTTPSErrors: true,
    javaScriptEnabled: false,
    locale: "en-US",
  });
  const russian = await browser.newContext({
    proxy,
    ignoreHTTPSErrors: true,
    javaScriptEnabled: false,
    locale: "ru-RU",
  });
  try {
    const [en, ru] = await Promise.all([english.newPage(), russian.newPage()]);
    const responses = await Promise.all([
      en.goto("https://localhost/?mode=login"),
      ru.goto("https://localhost/?mode=login"),
    ]);
    for (const response of responses) {
      expect(response?.status()).toBe(200);
      expect(await response?.headerValue("cache-control")).toBe("no-store");
      expect((await response?.headerValue("set-cookie")) ?? "").not.toContain(
        "insta_session=",
      );
    }
    await expect(en.locator("html")).toHaveAttribute("lang", "en");
    await expect(ru.locator("html")).toHaveAttribute("lang", "ru");
    await expect(
      en.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await expect(
      ru.getByRole("heading", { name: "Войти", exact: true }),
    ).toBeVisible();
  } finally {
    await Promise.all([english.close(), russian.close()]);
  }
});

test("E13 cold slow network preserves SSR locale/privacy and usable no-JS forms without a blocking overlay", async ({
  browser,
  proxy,
}) => {
  const english = await browser.newContext({
    proxy,
    ignoreHTTPSErrors: true,
    locale: "en-US",
    reducedMotion: "reduce",
  });
  const russian = await browser.newContext({
    proxy,
    ignoreHTTPSErrors: true,
    locale: "ru-RU",
    javaScriptEnabled: false,
    viewport: { width: 375, height: 800 },
  });
  try {
    const [en, ru] = await Promise.all([english.newPage(), russian.newPage()]);
    const client = await english.newCDPSession(en);
    await client.send("Network.enable");
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: 128000,
      uploadThroughput: 128000,
    });
    await Promise.all([
      en.goto("https://localhost/?mode=login", { timeout: 30000 }),
      ru.goto("https://localhost/?mode=login", { timeout: 30000 }),
    ]);
    await expect(en.locator("html")).toHaveAttribute("lang", "en");
    await expect(ru.locator("html")).toHaveAttribute("lang", "ru");
    const email = en.getByRole("textbox", { name: "Email", exact: true });
    await email.fill("synthetic-cold-start@example.test");
    await expect(email).toHaveValue("synthetic-cold-start@example.test");
    await expect(
      ru.getByRole("textbox", { name: "Электронная почта", exact: true }),
    ).toBeEditable();
    await expect(
      en.getByRole("button", { name: "Necessary cookies only", exact: true }),
    ).toBeVisible();
    await expect(
      ru.getByRole("button", { name: "Только необходимые", exact: true }),
    ).toBeVisible();
    expect(await en.evaluate(() => document.cookie)).not.toContain(
      "insta_consent",
    );
    expect(
      await ru.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await client.detach();
  } finally {
    await Promise.all([english.close(), russian.close()]);
  }
});
