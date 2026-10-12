import { expect, test } from "../../fixtures/browser-egress/test";

test("guest shell provides keyboard accessible sign-in and native form", async ({
  page,
}) => {
  await page.goto("http://localhost/?lang=en");
  await expect(page).toHaveURL(/^https:\/\/localhost/);
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Email", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
});

test("E01 guest private SSR renders no directory/message data and leads to native sign-in", async ({
  page,
}) => {
  const response = await page.goto("https://localhost/conversations");
  expect(response?.headers()["cache-control"]).toBe("no-store");
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await expect(page.getByTestId("message-list")).toHaveCount(0);
  await expect(page.getByTestId("current-actor")).toHaveCount(0);
  const signIn = page.getByRole("link", { name: "Sign in", exact: true });
  await signIn.last().click();
  await expect(
    page.getByRole("textbox", { name: "Email", exact: true }),
  ).toBeVisible();
  const html = await page.content();
  for (const secret of [
    "accessToken",
    "refreshToken",
    "revokeSecret",
    "bindingId",
  ])
    expect(html).not.toContain(secret);
});

test("single header entry reaches native registration stages and returns keyboard focus on cancel", async ({
  page,
}) => {
  await page.goto("https://localhost/?lang=en");
  const header = page.getByRole("banner");
  const signIn = header.getByRole("link", { name: "Sign in", exact: true });
  await expect(signIn).toHaveCount(1);
  await expect(
    header.getByRole("link", { name: /Sign up|Create account/ }),
  ).toHaveCount(0);
  await signIn.focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "No account? Create account", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Your email", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Sign in", exact: true })
    .click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(signIn).toBeFocused();
});
