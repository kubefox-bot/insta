import {
  expect,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";
import { withResource } from "../lifecycle/with-resource";

export const loginUser = async (
  page: Page,
  account: Readonly<{ email: string; password: string }>,
  rendering: "enhanced" | "native" = "enhanced",
) => {
  await page.goto("https://localhost/?mode=login");
  const form =
    rendering === "enhanced"
      ? page.getByRole("dialog", { name: "Sign in", exact: true })
      : page.locator("main");
  await expect(form).toBeVisible();
  await form
    .getByRole("textbox", { name: "Email", exact: true })
    .fill(account.email);
  await form.getByLabel("Password", { exact: true }).fill(account.password);
  const submit = () =>
    form.getByRole("button", { name: "Sign in", exact: true }).click();
  if (rendering === "native") {
    await submit();
    await expect(page.getByTestId("current-actor")).toBeVisible();
    return;
  }
  let layout: Response | undefined;
  let session: Response | undefined;
  const subsequentReads = new Set<Request>();
  const observeRequest = (request: Request) => {
    if (
      layout &&
      request.method() === "GET" &&
      new URL(request.url()).pathname === "/api/session"
    )
      subsequentReads.add(request);
  };
  const observeResponse = (response: Response) => {
    if (response.request().method() !== "GET") return;
    if (new URL(response.url()).pathname === "/__data.json") {
      layout = response;
      session = undefined;
      subsequentReads.clear();
    }
    if (subsequentReads.has(response.request())) session = response;
  };
  await withResource({
    start: async () => {
      page.on("request", observeRequest);
      page.on("response", observeResponse);
      return {
        dispose: async () => {
          page.off("request", observeRequest);
          page.off("response", observeResponse);
          subsequentReads.clear();
        },
      };
    },
    use: async () => {
      await submit();
      await expect.poll(() => !!layout && !!session).toBe(true);
      if (!layout || !session)
        throw new Error("Expected settled login layout and session responses");
      await Promise.all([layout.finished(), session.finished()]);
      await expect(page.getByTestId("current-actor")).toBeVisible();
    },
  });
};

export const logoutUser = async (page: Page) => {
  await page
    .getByRole("banner")
    .getByRole("button", { name: /^(Account menu|Меню аккаунта):/ })
    .click();
  await page.getByRole("menuitem", { name: /^(Sign out|Выйти)$/ }).click();
};

export const openLanguageSettings = async (page: Page) => {
  await page
    .getByRole("banner")
    .getByRole("button", {
      name: /^(Account menu:|Меню аккаунта:|Settings$|Настройки$)/,
    })
    .click();
  await page.getByRole("menuitem", { name: /^(Language|Язык)$/ }).click();
  const dialog = page.getByRole("dialog", { name: /^(Language|Язык)$/ });
  await expect(dialog).toBeVisible();
  return dialog;
};

export const selectLocale = async ({
  page,
  locale,
}: Readonly<{ page: Page; locale: "en" | "ru" }>) => {
  const dialog = await openLanguageSettings(page);
  await dialog
    .getByRole("button", {
      name: locale === "en" ? "English" : "Русский",
      exact: true,
    })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
};
