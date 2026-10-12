import { expect, test } from "../../fixtures/browser-egress/test";
import { probeSupportBrowserReport } from "../../fixtures/support/browser";

test("E12 technical dialog preserves failed/unknown submission draft, copy and original scope; retry saves with pending mail", async ({
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
    await expect(dialog).toHaveCount(1);
    await expect(dialog.getByTestId("support-original-id")).toBeVisible();
    const original = (
      await dialog.getByTestId("support-original-id").textContent()
    )
      ?.split(": ")
      .at(-1);
    await dialog.getByRole("textbox").fill(comment);
    const requests: Array<{
      scopeId: string;
      idempotencyKey: string;
      requestId: string;
      comment: string;
    }> = [];
    let blocked = true;
    await page.route("**/api/support", async (route) => {
      const request = route.request();
      requests.push({
        ...request.postDataJSON(),
        requestId: request.headers()["x-request-id"],
      });
      if (blocked) {
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
    await expect(dialog.getByRole("textbox")).toHaveValue(comment);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await dialog
      .getByRole("button", { name: "Copy details", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Copied", exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      comment,
    );
    blocked = false;
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/support") && response.status() === 202,
    );
    await dialog
      .getByRole("button", { name: "Send report", exact: true })
      .click();
    const response = await saved;
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.emailState).toBe("pending");
    await expect(dialog.getByRole("status")).toContainText(
      "Your report has been saved.",
    );
    await expect(dialog.getByRole("status")).toContainText("Email is pending.");
    expect(requests).toHaveLength(2);
    expect(requests[1]?.scopeId).toBe(requests[0]?.scopeId);
    expect(requests[1]?.idempotencyKey).toBe(requests[0]?.idempotencyKey);
    expect(requests[0]?.requestId).not.toBe(original);
    expect(requests[1]?.requestId).not.toBe(requests[0]?.requestId);
    const cookie = (await context.cookies()).find(
      (value) => value.name === "insta_support",
    );
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie?.value).not.toContain("proof");
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
