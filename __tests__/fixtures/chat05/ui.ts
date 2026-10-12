import { expect, type Page } from "@playwright/test";

export { loginUser as loginChatUser } from "../auth05/ui";
export const openChat = async (page: Page, username: string) => {
  await page.goto("https://localhost/conversations");
  await page.getByRole("searchbox").fill(username);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: username, exact: true }).click();
  await expect(page).toHaveURL(/\/conversations\/[a-f0-9]{24}$/);
  return page.url();
};
export const seedChatMessages = async ({
  page,
  url,
  texts,
}: Readonly<{ page: Page; url: string; texts: readonly string[] }>) => {
  const actor = await (
    await page.request.get("https://localhost/api/session")
  ).json();
  for (const text of texts) {
    const response = await page.request.post(
      `https://localhost/api${new URL(url).pathname}/messages`,
      {
        headers: {
          origin: "https://localhost",
          "X-Expected-Owner-ID": actor.data.userId,
          "X-Expected-Login-Generation": actor.data.generation,
          "X-Idempotency-Key": crypto.randomUUID(),
          "X-Operation-ID": crypto.randomUUID(),
        },
        data: { text, clientMessageId: crypto.randomUUID() },
      },
    );
    expect(response.status()).toBe(200);
  }
};
