import { expect, type Page } from "@playwright/test";
import type {} from "./browser";
import { installOutboxProbe } from "./install-browser";
export const loginOutbox = async (
  page: Page,
  account: Readonly<{ email: string; password: string }>,
) => {
  const response = await page.request.post("https://localhost/api/auth/login", {
    headers: { origin: "https://localhost" },
    data: account,
  });
  expect(response.status()).toBe(200);
};
export const connectOutbox = async ({
  page,
  namespace,
  conversationId,
  withoutLocks = false,
}: Readonly<{
  page: Page;
  namespace: string;
  conversationId: string;
  withoutLocks?: boolean;
}>) => {
  await page.goto("https://localhost/?mode=login");
  await installOutboxProbe(page);
  return page.evaluate(
    ({ namespace, conversationId, withoutLocks }) =>
      window.__outboxProbe.connect(namespace, conversationId, withoutLocks),
    { namespace, conversationId, withoutLocks },
  );
};
