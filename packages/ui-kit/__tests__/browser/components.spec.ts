import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mediaQueries } from "@insta/fe-core/ui/breakpoints";
import { chromium, errors, expect, test } from "@playwright/test";

test("avatars and named messenger icons preserve accessible ownership", async ({
  page,
}) => {
  await expect(
    page.getByRole("img", { name: "Edd avatar", exact: true }),
  ).toHaveText("ED");
  await expect(page.getByTestId("avatar-unicode")).toHaveText("👩🏽‍💻A");
  await expect(page.getByTestId("avatar-unknown")).toHaveText("?");
  const account = page.getByRole("button", {
    name: "Open Edd account",
    exact: true,
  });
  await expect(account).toHaveAccessibleName("Open Edd account");
  await expect(account.getByRole("img")).toHaveCount(0);
  for (const name of [
    "Search",
    "Clear",
    "Send",
    "Back",
    "Close",
    "Camera",
    "Plus",
    "Settings",
    "Clock",
    "Check",
    "DoubleCheck",
    "Error",
  ]) {
    const button = page.getByRole("button", {
      name: `Icon ${name}`,
      exact: true,
    });
    await expect(button).toHaveAccessibleName(`Icon ${name}`);
    await expect(button.locator("svg")).toHaveAttribute("aria-hidden", "true");
    await expect(button.locator("svg")).toHaveAttribute("focusable", "false");
    await button.focus();
    await expect(button).toBeFocused();
    await expect(button).toHaveCSS("outline-style", "solid");
  }
});

test("avatar palette, long names and doubled text remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const row = page.getByTestId("avatar-long-name");
  await expect(row).toHaveAccessibleName(
    "VeryLongUsernameThatMustRemainAccessibleWithoutWideningTheRow",
  );
  const geometry = await row.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    avatar: element.firstElementChild?.getBoundingClientRect().width,
    scroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.avatar).toBeGreaterThanOrEqual(40);
  for (const avatar of await page
    .getByTestId("avatar-palette")
    .locator(":scope > span")
    .all()) {
    const colors = await avatar.evaluate((element) => ({
      foreground: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
      transition: getComputedStyle(element).transitionDuration,
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
    }));
    const luminance = (color: string) => {
      const channels = (color.match(/\d+/g) ?? []).map((value) => {
        const channel = Number(value) / 255;
        return channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return (
        (channels[0] ?? 0) * 0.2126 +
        (channels[1] ?? 0) * 0.7152 +
        (channels[2] ?? 0) * 0.0722
      );
    };
    const foreground = luminance(colors.foreground);
    const background = luminance(colors.background);
    expect(
      (Math.max(foreground, background) + 0.05) /
        (Math.min(foreground, background) + 0.05),
    ).toBeGreaterThanOrEqual(4.5);
    expect(colors.width).toBe(colors.height);
    expect(colors.transition).toBe("0s");
  }
  await expect(page.getByTestId("avatar-palette")).toHaveCount(5);
});

test("explicit icon sizes and tones preserve the legacy default", async ({
  page,
}) => {
  await expect(page.getByTestId("icon-small").locator("svg")).toHaveCSS(
    "width",
    "16px",
  );
  await expect(page.getByTestId("icon-medium").locator("svg")).toHaveCSS(
    "width",
    "20px",
  );
  await expect(page.getByTestId("icon-medium").locator("svg")).toHaveCSS(
    "color",
    "rgb(84, 78, 73)",
  );
  await expect(page.getByTestId("icon-large").locator("svg")).toHaveCSS(
    "width",
    "24px",
  );
  await expect(page.getByTestId("icon-large").locator("svg")).toHaveCSS(
    "color",
    "rgb(215, 40, 69)",
  );
  const legacy = await page
    .getByTestId("icon-legacy")
    .locator("svg")
    .boundingBox();
  expect(legacy?.width).toBeCloseTo(22.4, 1);
});

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "UI fixtures ready" }),
  ).toBeVisible();
});
test("native_fields_keep_form_contract", async ({ page }) => {
  const email = page.getByRole("textbox", { name: "Email", exact: true });
  await expect(email).toHaveAttribute("name", "email");
  await email.fill("synthetic@example.test");
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("hello");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByTestId("form-data")).toHaveText(
    '[["email","synthetic@example.test"],["message","hello"],["action","send"]]',
  );
  await expect(page.getByTestId("input-events")).toHaveText(
    "synthetic@example.test",
  );
  await expect(
    page.getByRole("textbox", { name: "Invalid email" }),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByRole("textbox", { name: "Invalid email" }),
  ).toHaveAccessibleDescription("Email error");
});
test("loading_prevents_duplicate_submit", async ({ page }) => {
  const submit = page.getByRole("button", { name: "Submit", exact: true });
  await submit.click();
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveAttribute("aria-busy", "true");
  await submit.evaluate((element: HTMLButtonElement) => element.click());
  await page
    .getByRole("button", { name: "Disabled submit" })
    .evaluate((element: HTMLButtonElement) => element.click());
  await expect(page.getByTestId("submissions")).toHaveText("1");
});
test("button_link_is_native_anchor", async ({ page }) => {
  const link = page.getByRole("link", { name: "Native link" });
  await expect(link).toHaveAttribute("href", "#destination");
  await expect(link).toHaveJSProperty("tagName", "A");
  await link.click();
  await expect(page).toHaveURL(/#destination$/);
  await page
    .getByRole("link", { name: "Disabled link" })
    .evaluate((element: HTMLAnchorElement) => element.click());
  await expect(page).toHaveURL(/#destination$/);
});
test("dialog_restores_trigger_focus", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Open dialog" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Fixture dialog" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription("Dialog description");
  await expect(
    page.getByRole("textbox", { name: "Dialog field" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "Close dialog" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("textbox", { name: "Dialog field" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(
    page.getByRole("textbox", { name: "Dialog field" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

for (const width of [320, 767, 768, 1440]) {
  for (const textScale of [100, 200]) {
    test(`header dialog close control keeps keyboard focus, target and text at ${width}px/${textScale}%`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((scale) => {
        document.documentElement.style.fontSize = `${scale}%`;
      }, textScale);
      const trigger = page.getByRole("button", {
        name: "Open header dialog",
        exact: true,
      });
      await trigger.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", {
        name: "Header dialog",
        exact: true,
      });
      const close = dialog.getByRole("button", {
        name: width < 768 ? "Back from header dialog" : "Close header dialog",
        exact: true,
      });
      await expect(dialog).toBeVisible();
      await expect(close).toBeFocused();
      await expect(dialog.getByRole("button")).toHaveCount(1);
      await expect(close).toHaveCSS("outline-style", "solid");
      await expect(close).toHaveCSS("outline-width", "2px");
      await expect(close).toHaveCSS("outline-offset", "3px");
      await expect(close).toHaveCSS("outline-color", "rgb(136, 64, 41)");
      const bounds = await close.boundingBox();
      if (!bounds) throw new Error("Expected visible dialog header control");
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(
        await close.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await page.keyboard.press("Shift+Tab");
      await expect(
        dialog.getByRole("textbox", { name: "Header dialog field" }),
      ).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(close).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await page.keyboard.press("Enter");
      await close.click();
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  }
}

test("server_fields_hydrate_with_stable_label_ids", async ({
  page,
  request,
}) => {
  const html = await (await request.get("/")).text();
  const serverId = html.match(/<label for="([^"]+)"[^>]*>Email<\/label>/)?.[1];
  expect(serverId).toBeDefined();
  await expect(
    page.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveAttribute("id", serverId ?? "missing");
  await page.getByText("Email", { exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Email", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("textbox", { name: "Readonly email" }),
  ).toHaveAttribute("readonly", "");
});

test("variants_have_visible_focus_and_touch_targets", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  for (const variant of ["primary", "secondary", "text"]) {
    for (const size of ["sm", "md", "lg"]) {
      const button = page.getByRole("button", {
        name: `${variant} ${size}`,
        exact: true,
      });
      const box = await button.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
  }
  await expect(
    page.getByRole("textbox", { name: "Invalid message" }),
  ).toHaveAccessibleDescription("Message error");
  await page.getByRole("button", { name: "primary sm", exact: true }).focus();
  await expect(
    page.getByRole("button", { name: "primary sm", exact: true }),
  ).toHaveCSS("outline-style", "solid");
  await page.screenshot({
    path: new URL("../../../../.infra/ui/fixture-320.png", import.meta.url)
      .pathname,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Open dialog" }).click();
  await expect(
    page.getByRole("textbox", { name: "Dialog field" }),
  ).toBeFocused();
  await page.screenshot({
    path: new URL(
      "../../../../.infra/ui/fixture-dialog-1440.png",
      import.meta.url,
    ).pathname,
  });
});

for (const name of ["Disabled link", "Loading link"]) {
  test(`${name} prevents native middle-click navigation`, async ({ page }) => {
    const enabledPopup = page.context().waitForEvent("page");
    await page
      .getByRole("link", { name: "Native link" })
      .click({ button: "middle" });
    const enabledPage = await enabledPopup;
    await expect(enabledPage).toHaveURL(/#destination$/);
    await enabledPage.close();

    const blockedPopup = page
      .context()
      .waitForEvent("page", { timeout: 1000 })
      .catch((error: unknown) => {
        if (error instanceof errors.TimeoutError) return undefined;
        throw error;
      });
    await page
      .getByRole("link", { name, exact: true })
      .click({ button: "middle", force: true });
    const blockedPage = await blockedPopup;
    if (blockedPage) await blockedPage.close();
    expect(blockedPage !== undefined).toBe(false);
    await expect(
      page.getByRole("link", { name, exact: true }),
    ).not.toHaveAttribute("href");
    await expect(page).toHaveURL("http://127.0.0.1:4178/");
  });
}

test.describe("server rendered blocked anchors without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  for (const name of ["Disabled link", "Loading link"]) {
    test(`${name} prevents native navigation without JavaScript`, async ({
      page,
    }) => {
      const link = page.getByRole("link", { name, exact: true });
      await expect(link).toHaveAttribute("aria-disabled", "true");
      await link.click({ force: true });
      await expect(page).toHaveURL("http://127.0.0.1:4178/");
      await expect(link).not.toHaveAttribute("href");
      await page.getByRole("link", { name: "Native link" }).click();
      await expect(page).toHaveURL(/#destination$/);
    });
  }
});

test("menu keyboard choice closes then owned dialog restores its initiating trigger", async ({
  page,
}) => {
  const trigger = page.getByRole("button", {
    name: "Fixture settings",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page
    .getByRole("menuitem", { name: "First action", exact: true })
    .click();
  await expect(page.getByTestId("menu-selection")).toHaveText("First action");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page
    .getByRole("menuitem", { name: "Open owned dialog", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  const outside = await page
    .getByRole("heading", { name: "UI fixtures ready" })
    .boundingBox();
  if (!outside) throw new Error("Missing outside menu target");
  await page.mouse.click(
    outside.x + outside.width / 2,
    outside.y + outside.height / 2,
  );
  await expect(page.getByRole("menu")).toHaveCount(0);
});

for (const width of [767, 768, 769]) {
  test(`compiled media modules select exactly one layout at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByTestId("compact-layout")).toHaveCSS(
      "display",
      width < 768 ? "block" : "none",
    );
    await expect(page.getByTestId("split-layout")).toHaveCSS(
      "display",
      width < 768 ? "none" : "block",
    );
    expect(
      await page.evaluate(
        (queries) => ({
          compact: matchMedia(queries.compact).matches,
          split: matchMedia(queries.split).matches,
        }),
        mediaQueries,
      ),
    ).toEqual({ compact: width < 768, split: width >= 768 });
  });
}

test("browser initial-font preference preserves rem breakpoint semantics", async ({
  baseURL,
}, testInfo) => {
  const profile = await mkdtemp(join(tmpdir(), "insta-ui-font-"));
  try {
    await mkdir(join(profile, "Default"));
    await writeFile(
      join(profile, "Default", "Preferences"),
      '{"webkit":{"webprefs":{"default_font_size":20}}}',
    );
    const context = await chromium.launchPersistentContext(profile, {
      ...testInfo.project.use.launchOptions,
      channel: testInfo.project.use.channel,
      headless: true,
      viewport: { width: 959, height: 900 },
    });
    try {
      const page = await context.newPage();
      await page.goto(baseURL ?? "http://127.0.0.1:4178");
      expect(
        await page.evaluate(
          () => getComputedStyle(document.documentElement).fontSize,
        ),
      ).toBe("20px");
      for (const width of [959, 960, 961]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.getByTestId("compact-layout")).toHaveCSS(
          "display",
          width < 960 ? "block" : "none",
        );
        await expect(page.getByTestId("split-layout")).toHaveCSS(
          "display",
          width < 960 ? "none" : "block",
        );
        expect(
          await page.evaluate(
            (queries) => ({
              compact: matchMedia(queries.compact).matches,
              split: matchMedia(queries.split).matches,
            }),
            mediaQueries,
          ),
        ).toEqual({ compact: width < 960, split: width >= 960 });
      }
    } finally {
      await context.close();
    }
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
});
