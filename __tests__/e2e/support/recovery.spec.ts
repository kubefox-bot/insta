import { expect, test } from "../../fixtures/browser-egress/test";
import { probeSupportBrowserReport } from "../../fixtures/support/browser";

test("I1 persisted response lost then edit close reopen retries the entire original report once", async ({
  page,
  context,
}) => {
  const original = `support-e12-${crypto.randomUUID()}`;
  const edited = `${original} corrected draft`;
  let reportId = "";
  const payloads: unknown[] = [];
  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("https://localhost/?lang=en");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("menuitem", { name: "Report a problem", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Something went wrong",
      exact: true,
    });
    await dialog.getByRole("textbox").fill(original);
    let first = true;
    await page.route("**/api/support", async (route) => {
      payloads.push(route.request().postDataJSON());
      if (first) {
        first = false;
        const saved = await route.fetch();
        expect(saved.status()).toBe(202);
        reportId = (await saved.json()).data.reportId;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });
    await dialog
      .getByRole("button", { name: "Send report", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toContainText(
      "Your text is still here",
    );
    await expect(dialog.getByRole("note")).toContainText(
      "previous result may be unknown",
    );
    await dialog.getByRole("textbox").fill(edited);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("menuitem", { name: "Report a problem", exact: true })
      .click();
    await expect(dialog.getByRole("textbox")).toHaveValue(edited);
    const response = page.waitForResponse((value) =>
      value.url().endsWith("/api/support"),
    );
    await dialog
      .getByRole("button", { name: "Send report", exact: true })
      .click();
    const retried = await response;
    expect(retried.status()).toBe(202);
    expect((await retried.json()).data.reportId).toBe(reportId);
    expect(payloads).toHaveLength(2);
    expect(payloads[1]).toEqual(payloads[0]);
    expect(await probeSupportBrowserReport("inspect", original)).toEqual({
      reports: 1,
      canonical: 1,
      emailState: "accepted",
      mailpitMessages: 1,
    });
  } finally {
    await probeSupportBrowserReport("cleanup", original);
  }
});

test("I2 expired support cookie offers an explicit new scope and retains draft copy without auto submit", async ({
  page,
  context,
}) => {
  const comment = `support-e12-${crypto.randomUUID()}`;
  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("https://localhost/?lang=en");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("menuitem", { name: "Report a problem", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Something went wrong",
      exact: true,
    });
    await dialog.getByRole("textbox").fill(comment);
    await expect(
      dialog.getByRole("button", { name: "Send report", exact: true }),
    ).toBeEnabled();
    const cookie = (await context.cookies()).find(
      (value) => value.name === "insta_support",
    );
    if (!cookie) throw new Error("Expected own form cookie");
    await context.addCookies([
      { ...cookie, expires: Math.floor(Date.now() / 1000) - 1 },
    ]);
    const invalid = Promise.withResolvers<string>();
    let submissions = 0;
    await page.route("**/api/support", async (route) => {
      submissions++;
      const response = await route.fetch();
      if (response.status() !== 202)
        invalid.resolve((await response.json()).error.code);
      await route.fulfill({ response });
    });
    await dialog
      .getByRole("button", { name: "Send report", exact: true })
      .click();
    expect(await invalid.promise).toBe("SUPPORT_CONTEXT_INVALID");
    await expect(
      dialog.getByRole("button", { name: "New report", exact: true }),
    ).toBeVisible();
    await expect(dialog.getByRole("textbox")).toHaveValue(comment);
    await dialog
      .getByRole("button", { name: "Copy details", exact: true })
      .click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      comment,
    );
    await dialog
      .getByRole("button", { name: "New report", exact: true })
      .click();
    await expect(dialog.getByRole("textbox")).toHaveValue(comment);
    await expect(
      dialog.getByRole("button", { name: "Send report", exact: true }),
    ).toBeEnabled();
    expect(submissions).toBe(1);
    const accepted = page.waitForResponse(
      (value) => value.url().endsWith("/api/support") && value.status() === 202,
    );
    await dialog
      .getByRole("button", { name: "Send report", exact: true })
      .click();
    await accepted;
    expect(await probeSupportBrowserReport("inspect", comment)).toEqual({
      reports: 1,
      canonical: 1,
      emailState: "accepted",
      mailpitMessages: 1,
    });
  } finally {
    await probeSupportBrowserReport("cleanup", comment);
  }
});

import { startAuthFixture } from "../../fixtures/auth05/browser";

test("I2 actor change requires a new explicit report scope and keeps the draft", async ({
  page,
}) => {
  const comment = `support-e12-${crypto.randomUUID()}`;
  const fixture = await startAuthFixture();
  try {
    await page.goto("https://localhost/?lang=en");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("menuitem", { name: "Report a problem", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Something went wrong",
      exact: true,
    });
    await dialog.getByRole("textbox").fill(comment);
    await expect(
      dialog.getByRole("button", { name: "Send report", exact: true }),
    ).toBeEnabled();
    const login = await page.evaluate(async (account) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(account),
      });
      return response.status;
    }, fixture.account);
    expect(login).toBe(200);
    const failure = Promise.withResolvers<string>();
    await page.route("**/api/support", async (route) => {
      const response = await route.fetch();
      if (response.status() !== 202)
        failure.resolve((await response.json()).error.code);
      await route.fulfill({ response });
    });
    await dialog
      .getByRole("button", { name: "Send report", exact: true })
      .click();
    expect(await failure.promise).toBe("ACTOR_CHANGED");
    await expect(dialog.getByRole("status")).toContainText(
      "The account changed",
    );
    await expect(dialog.getByRole("textbox")).toHaveValue(comment);
    await dialog
      .getByRole("button", { name: "New report", exact: true })
      .click();
    await expect(dialog.getByRole("textbox")).toHaveValue(comment);
    await expect(
      dialog.getByRole("button", { name: "Send report", exact: true }),
    ).toBeEnabled();
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/support") && response.status() === 202,
    );
    await dialog
      .getByRole("button", { name: "Send report", exact: true })
      .click();
    await saved;
    expect(await probeSupportBrowserReport("inspect", comment)).toEqual({
      reports: 1,
      canonical: 1,
      emailState: "accepted",
      mailpitMessages: 1,
    });
  } finally {
    try {
      await probeSupportBrowserReport("cleanup", comment);
    } finally {
      await fixture.dispose();
    }
  }
});
