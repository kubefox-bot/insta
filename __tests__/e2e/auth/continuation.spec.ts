import { z } from "zod";
import { expect, test } from "../../fixtures/browser-egress/test";
import { withResource } from "../../fixtures/lifecycle/with-resource";

test("two tabs retain protected context across reload and cancel only selected intent; foreign context and future action stay unavailable", async ({
  page,
  context,
  browser,
  proxy,
}) => {
  const owned: string[] = [];
  await withResource({
    start: async () => {
      const second = await context.newPage();
      return {
        second,
        dispose: async () => {
          const settled = await Promise.allSettled([
            ...owned.map((id) =>
              context.request.delete(
                `https://localhost/api/auth/continuation/${id}`,
                { headers: { origin: "https://localhost" } },
              ),
            ),
            second.close(),
          ]);
          const failures = settled.filter(
            (result) => result.status === "rejected",
          );
          if (failures.length)
            throw new AggregateError(
              failures.map((result) => result.reason),
              "Continuation fixture cleanup failed",
            );
        },
      };
    },
    use: async ({ second }) => {
      await page.goto("https://localhost/?mode=login");
      await second.goto("https://localhost/?mode=login");
      const create = async () =>
        z
          .object({
            ok: z.literal(true),
            data: z.object({ intentId: z.uuid(), expiresAt: z.number() }),
          })
          .parse(
            await page.evaluate(async () => {
              const response = await fetch("/api/auth/continuation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "create_story",
                  operationId: crypto.randomUUID(),
                }),
              });
              return response.json();
            }),
          ).data;
      const first = await create();
      const next = await create();
      owned.push(first.intentId, next.intentId);
      const cookie = (await context.cookies()).find(
        (cookie) => cookie.name === "insta_continuation",
      );
      expect(cookie).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      });
      expect(await page.evaluate(() => document.cookie)).not.toContain(
        "insta_continuation",
      );
      await page.goto(
        `https://localhost/?mode=login&intentId=${first.intentId}`,
      );
      const dialog = page.getByRole("dialog", { name: "Sign in", exact: true });
      await expect(dialog).toBeVisible({ timeout: 5000 });
      const cancel = dialog.getByRole("button", {
        name: "Cancel",
        exact: true,
      });
      await expect(cancel).toBeVisible({ timeout: 5000 });
      const cancelled = page.waitForResponse(
        (response) =>
          response.request().method() === "DELETE" &&
          response.url() ===
            `https://localhost/api/auth/continuation/${first.intentId}`,
        { timeout: 5000 },
      );
      await cancel.click();
      expect((await cancelled).status()).toBe(200);
      expect(
        (
          await context.request.delete(
            `https://localhost/api/auth/continuation/${first.intentId}`,
            { headers: { origin: "https://localhost" } },
          )
        ).status(),
      ).toBe(409);
      expect(
        (await context.cookies()).find(
          (cookie) => cookie.name === "insta_continuation",
        )?.value,
      ).toBe(cookie?.value);
      const foreign = await browser.newContext({
        proxy,
        ignoreHTTPSErrors: true,
      });
      try {
        expect(
          (
            await foreign.request.delete(
              `https://localhost/api/auth/continuation/${next.intentId}`,
              { headers: { origin: "https://localhost" } },
            )
          ).status(),
        ).toBe(409);
      } finally {
        await foreign.close();
      }
      await second.reload();
      const result = await second.evaluate(async (id) => {
        const response = await fetch(`/api/auth/continuation/${id}`, {
          method: "DELETE",
        });
        return response.status;
      }, next.intentId);
      expect(result).toBe(200);
      expect(
        (await context.cookies()).find(
          (cookie) => cookie.name === "insta_continuation",
        )?.value,
      ).toBe(cookie?.value);
    },
  });
});

import { startChatFixture } from "../../fixtures/chat05/browser";

test("E04 guest composer intent survives reload and real login; explicit Continue opens recipient without sending", async ({
  page,
  context,
}) => {
  const fixture = await startChatFixture();
  const owned: string[] = [];
  try {
    await page.goto("https://localhost/?mode=login");
    const intent = await page.evaluate(async (recipientId) => {
      const response = await fetch("/api/auth/continuation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "compose_message",
          recipientId,
          operationId: crypto.randomUUID(),
        }),
      });
      return response.json();
    }, fixture.bob.id);
    const { intentId, expiresAt } = z
      .object({ data: z.object({ intentId: z.uuid(), expiresAt: z.number() }) })
      .parse(intent).data;
    owned.push(intentId);
    await page.goto(`https://localhost/?mode=login&intentId=${intentId}`);
    await page.reload();
    await page
      .getByRole("textbox", { name: "Email", exact: true })
      .fill(fixture.alice.email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(fixture.alice.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByTestId("current-actor")).toHaveText(
      fixture.alice.username,
    );
    await expect(page.getByTestId("message-composer")).toHaveCount(0);
    await page.getByRole("link", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL(/\/conversations\/[a-f0-9]{24}$/);
    const url = page.url();
    await expect(page.getByTestId("message-composer")).toHaveValue("");
    await expect(
      page.getByTestId("message-list").locator("[data-message-id]"),
    ).toHaveCount(0);
    const conversationId = new URL(url).pathname.split("/").at(-1);
    const canonical = await (
      await fetch(`${fixture.url}/canonical?conversationId=${conversationId}`)
    ).json();
    expect(canonical).toEqual([]);
    expect(expiresAt).toBeGreaterThan(Date.now());
    await page.reload();
    await expect(page).toHaveURL(url);
    await expect(page.getByTestId("message-composer")).toHaveValue("");
    await expect(
      page.getByTestId("message-list").locator("[data-message-id]"),
    ).toHaveCount(0);
  } finally {
    for (const id of owned)
      await context.request.delete(
        `https://localhost/api/auth/continuation/${id}`,
        { headers: { origin: "https://localhost" } },
      );
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});
