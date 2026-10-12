import { type BrowserContext, expect, type Page } from "@playwright/test";
import { z } from "zod";
import { startAuthFixture } from "../../../fixtures/auth05/browser";
export const startSessionFaultFixture = () =>
  startAuthFixture({
    hostEntrypoint: "__tests__/fixtures/bff-session/browser-host.ts",
  });
export const currentSessionCookie = async (context: BrowserContext) => {
  const cookie = (await context.cookies()).find(
    (value) => value.name === "insta_session",
  );
  if (!cookie) throw new Error("Expected owned main login cookie");
  return `insta_session=${cookie.value}`;
};
export const controlSessionFault = async ({
  page,
  url,
  cookie,
  action,
}: {
  readonly page: Page;
  readonly url: string;
  readonly cookie: string;
  readonly action: string;
}) => {
  const response = await page.request.post(`${url}/control`, {
    headers: { cookie, origin: "https://localhost" },
    data: { action },
  });
  expect(response.status()).toBe(200);
  return response.json();
};
export const inspectSessionFault = async (
  options: Omit<Parameters<typeof controlSessionFault>[0], "action">,
) =>
  z
    .object({
      blocked: z.boolean(),
      revision: z.number().int(),
      pending: z.boolean(),
      confirmed: z.boolean(),
      entered: z.boolean(),
      attemptKey: z.string().optional(),
      recoverUntil: z.number().optional(),
      refreshKeys: z.array(z.string()),
      nativeState: z.string(),
      canonicalLogouts: z.number().int(),
    })
    .parse(await controlSessionFault({ ...options, action: "inspect" }));
export { loginUser as loginMainUser } from "../../../fixtures/auth05/ui";
