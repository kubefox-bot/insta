import type { Page } from "@playwright/test";
import { z } from "zod";
import { expect } from "../../../fixtures/browser-egress/test";
import type { startChatFixture } from "../../../fixtures/chat05/browser";
import { loginChatUser, openChat } from "../../../fixtures/chat05/ui";
import { createMailObserver } from "../../../fixtures/registration/mailpit";

export const suspendDraft = async ({
  page,
  fixture,
  text,
}: Readonly<{
  page: Page;
  fixture: Awaited<ReturnType<typeof startChatFixture>>;
  text: string;
}>) => {
  await loginChatUser(page, fixture.alice);
  const url = await openChat(page, fixture.bob.username);
  await page.getByTestId("message-composer").fill(text);
  const actor = z
    .object({ data: z.object({ generation: z.uuid() }) })
    .parse(
      await (await page.request.get("https://localhost/api/session")).json(),
    );
  const expired = z.object({ expired: z.number() }).parse(
    await (
      await fetch(`${fixture.url}/expire-alice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generation: actor.data.generation }),
      })
    ).json(),
  );
  expect(expired.expired).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByTestId("current-actor")).toHaveCount(0);
  const register = page
    .getByRole("banner")
    .getByRole("link", { name: "Sign in", exact: true });
  await expect(register).toHaveAttribute("href", /intentId=/);
  const href = await register.getAttribute("href");
  if (!href) throw new Error("Selected continuation link missing");
  const intentId = z
    .uuid()
    .parse(new URL(href, "https://localhost").searchParams.get("intentId"));
  return {
    url,
    intentId,
    conversationId: new URL(url).pathname.split("/").at(-1),
  };
};
export const modalLogin = async (
  page: Page,
  account: Readonly<{ email: string; password: string }>,
) => {
  await page
    .getByRole("link", { name: "Sign in", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Email", exact: true })
    .fill(account.email);
  await dialog.getByLabel("Password", { exact: true }).fill(account.password);
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("current-actor")).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
};
export const readRegistrationCode = async ({
  email,
  hostMailpitUrl,
}: Readonly<{ email: string; hostMailpitUrl: string }>) => {
  const observer = createMailObserver({
    url: hostMailpitUrl,
    emails: new Set([email]),
  });
  await expect.poll(async () => (await observer.read(email)).length).toBe(1);
  const message = (await observer.read(email))[0];
  return z
    .string()
    .regex(/^[0-9]{6}$/)
    .parse(message?.Text.match(/Код подтверждения: ([0-9]{6})/)?.[1]);
};
