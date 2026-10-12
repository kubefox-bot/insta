import { z } from "zod";
import { startAuthFixture } from "../../fixtures/auth05/browser";
import { logoutUser, loginUser as signIn } from "../../fixtures/auth05/ui";
import { expect, test } from "../../fixtures/browser-egress/test";
import { startChatFixture } from "../../fixtures/chat05/browser";

test("auth body and forms follow two-tab S2 and logout without a reload", async ({
  page,
  context,
}) => {
  const fixture = await startChatFixture();
  const second = await context.newPage();
  const owned: string[] = [];

  const signOut = async (target: typeof page) => {
    const response = target.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/",
    );
    await logoutUser(target);
    await (await response).finished();
  };
  try {
    await page.goto("https://localhost/?mode=login");
    const response = await context.request.post(
      "https://localhost/api/auth/continuation",
      {
        headers: { origin: "https://localhost" },
        data: {
          type: "compose_message",
          recipientId: fixture.mallory.id,
          operationId: crypto.randomUUID(),
        },
      },
    );
    expect(response.status()).toBe(200);
    const intentId = z
      .object({ data: z.object({ intentId: z.uuid() }) })
      .parse(await response.json()).data.intentId;
    owned.push(intentId);
    await signIn(page, fixture.alice);
    await page.goto(`https://localhost/?mode=login&intentId=${intentId}`);
    await second.goto("https://localhost/");
    await signOut(second);
    await expect(page.getByTestId("current-actor")).toHaveCount(0);
    await expect(
      page
        .getByRole("dialog")
        .getByRole("textbox", { name: "Email", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Continue", exact: true }),
    ).toHaveCount(0);
    await signIn(second, fixture.bob);
    const current = await second.getByTestId("current-actor").innerText();
    await expect(page.getByTestId("current-actor")).toHaveText(current);
    await expect(
      page.locator("main").getByRole("heading", { level: 1 }),
    ).toHaveText(current);
    await expect(
      page.getByRole("link", { name: "Continue", exact: true }),
    ).toHaveAttribute("href", `/continue?intentId=${intentId}`);
    await expect(page.locator('input[name="email"]')).toHaveCount(0);
    await signOut(second);
    await expect(page.getByTestId("current-actor")).toHaveCount(0);
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Continue", exact: true }),
    ).toHaveCount(0);
  } finally {
    for (const id of owned)
      await context.request.delete(
        `https://localhost/api/auth/continuation/${id}`,
        { headers: { origin: "https://localhost" } },
      );
    await second.close();
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});

test("authentic delayed S1 layout and locale never replace confirmed S2 header or body", async ({
  page,
  context,
}) => {
  const fixture = await startAuthFixture();
  const second = await context.newPage();
  const reached = Promise.withResolvers<string>();
  const release = Promise.withResolvers<void>();
  let held = false;
  try {
    await page.goto("https://localhost/?mode=login");
    await expect(
      page.getByRole("dialog", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Email", exact: true })
      .fill(fixture.account.email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(fixture.account.password);
    await context.request.post("https://localhost/locale", {
      form: { locale: "ru" },
      headers: { origin: "https://localhost" },
    });
    await page.route("**/__data.json**", async (route) => {
      if (held || new URL(route.request().url()).pathname !== "/__data.json")
        return route.continue();
      held = true;
      const response = await route.fetch();
      reached.resolve(await response.text());
      await release.promise;
      await route.fulfill({ response });
    });
    const submitting = page
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    const delayed = await reached.promise;
    await expect(page.getByTestId("current-actor")).toBeVisible();
    const firstActor = await page.getByTestId("current-actor").innerText();
    expect(delayed).toContain(firstActor);
    expect(delayed).toContain('"ru"');
    await context.request.post("https://localhost/locale", {
      form: { locale: "en" },
      headers: { origin: "https://localhost" },
    });
    await second.goto("https://localhost/");
    const revoked = second.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/",
    );
    await logoutUser(second);
    await (await revoked).finished();
    await expect(
      second
        .getByRole("banner")
        .getByRole("link", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await second.goto("https://localhost/?mode=login");
    await expect(
      second.getByRole("dialog", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await second
      .getByRole("textbox", { name: "Email", exact: true })
      .fill(fixture.secondAccount.email);
    await second
      .getByLabel("Password", { exact: true })
      .fill(fixture.secondAccount.password);
    const signingSecond = second
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(second.getByTestId("current-actor")).toBeVisible();
    await signingSecond;
    const current = await second.getByTestId("current-actor").innerText();
    expect(current).not.toBe(firstActor);
    await expect(page.getByTestId("current-actor")).toHaveText(current);
    release.resolve();
    await submitting;
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await expect(page.getByTestId("current-actor")).toHaveText(current);
    await expect(
      page.locator("main").getByRole("heading", { level: 1 }),
    ).toHaveText(current);
  } finally {
    release.resolve();
    await second.close();
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});
