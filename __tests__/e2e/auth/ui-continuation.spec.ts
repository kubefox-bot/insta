import { expect, test } from "../../fixtures/browser-egress/test";
import { startChatFixture } from "../../fixtures/chat05/browser";
import { loginChatUser, openChat } from "../../fixtures/chat05/ui";
import { withResource } from "../../fixtures/lifecycle/with-resource";

test("UI04 real expiry preserves same-owner draft through modal reauth and safe Continue; Send commits once", async ({
  page,
}) => {
  await withResource({
    start: () => startChatFixture(),
    use: async (fixture) => {
      try {
        await loginChatUser(page, fixture.alice);
        const savedPreference = page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/privacy/consent") &&
            response.request().method() === "POST",
        );
        await page
          .getByRole("button", { name: "Necessary cookies only", exact: true })
          .click();
        expect((await savedPreference).status()).toBe(200);
        await expect(
          page.getByRole("button", {
            name: "Necessary cookies only",
            exact: true,
          }),
        ).toHaveCount(0);
        const url = await openChat(page, fixture.bob.username);
        const conversationId = new URL(url).pathname.split("/").at(-1);
        const text = "UI04 private draft requires explicit Send";
        await page.getByTestId("message-composer").fill(text);
        expect(
          await (
            await fetch(
              `${fixture.url}/canonical?conversationId=${conversationId}`,
            )
          ).json(),
        ).toEqual([]);
        const actor = await (
          await page.request.get("https://localhost/api/session")
        ).json();
        const expired = await (
          await fetch(`${fixture.url}/expire-alice`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ generation: actor.data.generation }),
          })
        ).json();
        expect(expired.expired).toBeGreaterThan(0);
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await expect(page.getByTestId("current-actor")).toHaveCount(0);
        await page
          .getByRole("link", { name: "Sign in", exact: true })
          .first()
          .click();
        await page
          .getByRole("textbox", { name: "Email", exact: true })
          .fill(fixture.alice.email);
        await page
          .getByLabel("Password", { exact: true })
          .fill(fixture.alice.password);
        await page
          .getByRole("button", { name: "Sign in", exact: true })
          .click();
        await expect(page.getByTestId("current-actor")).toHaveText(
          fixture.alice.username,
        );
        await page.getByRole("link", { name: "Continue", exact: true }).click();
        await expect(page.getByTestId("message-composer")).toHaveValue(text);
        expect(
          await (
            await fetch(
              `${fixture.url}/canonical?conversationId=${conversationId}`,
            )
          ).json(),
        ).toEqual([]);
        expect(page.url()).not.toContain(text);
        await page.getByRole("button", { name: "Send", exact: true }).click();
        await expect
          .poll(
            async () =>
              (
                await (
                  await fetch(
                    `${fixture.url}/canonical?conversationId=${conversationId}`,
                  )
                ).json()
              ).length,
          )
          .toBe(1);
        await expect(page.getByTestId("message-composer")).toHaveValue("");
        await page.reload();
        await expect(page.getByTestId("message-composer")).toHaveValue("");
      } finally {
        test.setTimeout(test.info().timeout + 20000);
      }
    },
  });
});

import { startAuthFixture } from "../../fixtures/auth05/browser";
import {
  modalLogin,
  readRegistrationCode,
  suspendDraft,
} from "./lib/ui-recovery";

test("UI04 modal cancel removes password and cancels only selected intent; different actor gets no text", async ({
  page,
}) => {
  await withResource({
    start: () => startChatFixture(),
    use: async (fixture) => {
      try {
        const suspended = await suspendDraft({
          page,
          fixture,
          text: "Never show old Alice text to Mallory",
        });
        const another = await (
          await page.request.post("https://localhost/api/auth/continuation", {
            headers: { origin: "https://localhost" },
            data: {
              type: "compose_message",
              recipientId: fixture.bob.id,
              operationId: crypto.randomUUID(),
            },
          })
        ).json();
        await page
          .getByRole("link", { name: "Sign in", exact: true })
          .first()
          .click();
        await page
          .getByLabel("Password", { exact: true })
          .fill("synthetic-password-unsent");
        await page.getByRole("button", { name: "Close", exact: true }).click();
        await expect(page.locator('input[type="password"]')).toHaveCount(0);
        expect(
          (
            await page.request.delete(
              `https://localhost/api/auth/continuation/${another.data.intentId}`,
              { headers: { origin: "https://localhost" } },
            )
          ).status(),
        ).toBe(200);
        await modalLogin(page, fixture.mallory);
        await expect(page.getByTestId("current-actor")).toHaveText(
          fixture.mallory.username,
        );
        expect(
          (
            await page.request.post(
              `https://localhost/api/auth/continuation/${suspended.intentId}/resume`,
              { headers: { origin: "https://localhost" } },
            )
          ).status(),
        ).toBe(409);
        await page
          .getByRole("link", { name: "Chats", exact: true })
          .first()
          .click();
        await expect(page.getByTestId("message-composer")).toHaveCount(0);
        await expect(page.locator("body")).not.toContainText(
          "Never show old Alice text to Mallory",
        );
        expect(
          await (
            await fetch(
              `${fixture.url}/canonical?conversationId=${suspended.conversationId}`,
            )
          ).json(),
        ).toEqual([]);
      } finally {
        test.setTimeout(test.info().timeout + 20000);
      }
    },
  });
});

test("UI04 registration uses client navigation/server stages and discards previous account draft with zero automatic messages", async ({
  page,
}) => {
  const teardownBaseTimeoutMs = test.info().timeout;
  await withResource({
    start: () => startChatFixture(),
    use: async (fixture) => {
      try {
        await withResource({
          start: startAuthFixture,
          use: async (registration) => {
            try {
              const suspended = await suspendDraft({
                page,
                fixture,
                text: "Alice confidential draft before signup",
              });
              await page.evaluate(() => {
                const marker = document.createElement("meta");
                marker.name = "ui04-client-instance";
                marker.content = "alive";
                document.head.append(marker);
              });
              await page
                .getByRole("link", { name: "Sign in", exact: true })
                .first()
                .click();
              const registrationLink = page
                .getByRole("dialog")
                .getByRole("link", {
                  name: "No account? Create account",
                  exact: true,
                });
              await expect(registrationLink).toHaveAttribute(
                "href",
                new RegExp(`intentId=${suspended.intentId}`),
              );
              await registrationLink.click();
              await expect(page).toHaveURL(suspended.url);
              await expect(
                page.getByRole("dialog", {
                  name: "Create account",
                  exact: true,
                }),
              ).toBeVisible();
              await expect(
                page.locator('meta[name="ui04-client-instance"]'),
              ).toHaveAttribute("content", "alive");
              await expect(page.getByRole("dialog")).toHaveCount(1);
              await page
                .getByRole("textbox", { name: "Your email", exact: true })
                .fill(registration.signupEmail);
              await page
                .getByRole("button", { name: "Get code", exact: true })
                .click();
              await expect(
                page.getByRole("textbox", {
                  name: "Code from your email",
                  exact: true,
                }),
              ).toBeVisible();
              await expect(page.getByRole("dialog")).toContainText("UTC");
              await page
                .getByRole("textbox", {
                  name: "Code from your email",
                  exact: true,
                })
                .fill(
                  await readRegistrationCode({
                    email: registration.signupEmail,
                    hostMailpitUrl: registration.hostMailpitUrl,
                  }),
                );
              await page
                .getByRole("button", { name: "Continue", exact: true })
                .click();
              await page
                .getByRole("textbox", {
                  name: "How people will find you",
                  exact: true,
                })
                .fill(
                  `U${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
                );
              await page
                .getByLabel("Password", { exact: true })
                .fill("synthetic-password-123");
              await page
                .getByRole("button", {
                  name: "Create account",
                  exact: true,
                })
                .click();
              await expect(page.getByTestId("current-actor")).toBeVisible();
              await expect(page).toHaveURL(suspended.url);
              await expect(
                page.locator('meta[name="ui04-client-instance"]'),
              ).toHaveAttribute("content", "alive");
              await page
                .getByRole("link", { name: "Continue", exact: true })
                .click();
              await expect(page).toHaveURL(/\/conversations\/[a-f0-9]{24}$/);
              await expect(page.getByTestId("message-composer")).toHaveValue(
                "",
              );
              await expect(
                page.getByTestId("message-list").locator("[data-message-id]"),
              ).toHaveCount(0);
              expect(
                await (
                  await fetch(
                    `${fixture.url}/canonical?conversationId=${suspended.conversationId}`,
                  )
                ).json(),
              ).toEqual([]);
              expect(page.url()).not.toContain("confidential");
            } finally {
              test.setTimeout(teardownBaseTimeoutMs + 20000);
            }
          },
        });
      } finally {
        test.setTimeout(teardownBaseTimeoutMs + 20000);
      }
    },
  });
});

test("UI04 selected recipient survives reload but memory draft does not", async ({
  page,
}) => {
  await withResource({
    start: () => startChatFixture(),
    use: async (fixture) => {
      try {
        const suspended = await suspendDraft({
          page,
          fixture,
          text: "reload must erase unsaved text",
        });
        await page
          .getByRole("link", { name: "Sign in", exact: true })
          .first()
          .click();
        await page
          .getByRole("dialog")
          .getByRole("link", {
            name: "No account? Create account",
            exact: true,
          })
          .click();
        await expect(page).toHaveURL(suspended.url);
        await expect(
          page.getByRole("dialog", { name: "Create account", exact: true }),
        ).toBeVisible();
        const fallback = await page
          .getByRole("dialog")
          .getByRole("link", { name: "Sign in", exact: true })
          .getAttribute("href");
        if (!fallback)
          throw new Error("Missing native selected-intent auth fallback");
        await page.goto(`https://localhost${fallback}`);
        await page.reload();
        await expect(page).toHaveURL(
          `https://localhost/?mode=login&intentId=${suspended.intentId}`,
        );
        await expect(
          page.getByRole("dialog", { name: "Sign in", exact: true }),
        ).toBeVisible();
        await page
          .getByRole("textbox", { name: "Email", exact: true })
          .fill(fixture.alice.email);
        await page
          .getByLabel("Password", { exact: true })
          .fill(fixture.alice.password);
        await page
          .getByRole("button", { name: "Sign in", exact: true })
          .click();
        await expect(page.getByTestId("current-actor")).toHaveText(
          fixture.alice.username,
        );
        await page.getByRole("link", { name: "Continue", exact: true }).click();
        await expect(page).toHaveURL(suspended.url);
        await expect(page.getByTestId("message-composer")).toHaveValue("");
        expect(
          await (
            await fetch(
              `${fixture.url}/canonical?conversationId=${suspended.conversationId}`,
            )
          ).json(),
        ).toEqual([]);
      } finally {
        test.setTimeout(test.info().timeout + 20000);
      }
    },
  });
});

test("UI04 different-owner modal reauth discards unsent text before opening their own thread", async ({
  page,
}) => {
  await withResource({
    start: () => startChatFixture(),
    use: async (fixture) => {
      try {
        const suspended = await suspendDraft({
          page,
          fixture,
          text: "Old owner secret must never appear",
        });
        await modalLogin(page, fixture.mallory);
        await expect(page.getByTestId("current-actor")).toHaveText(
          fixture.mallory.username,
        );
        await expect(
          page.getByRole("link", { name: "Continue", exact: true }),
        ).toHaveCount(0);
        await page
          .getByRole("link", { name: "Chats", exact: true })
          .first()
          .click();
        await page.getByRole("searchbox").fill(fixture.bob.username);
        await page.getByRole("button", { name: "Search", exact: true }).click();
        await page
          .getByRole("button", { name: fixture.bob.username, exact: true })
          .click();
        await expect(page.getByTestId("message-composer")).toHaveValue("");
        await expect(page.locator("body")).not.toContainText(
          "Old owner secret must never appear",
        );
        expect(
          await (
            await fetch(
              `${fixture.url}/canonical?conversationId=${suspended.conversationId}`,
            )
          ).json(),
        ).toEqual([]);
      } finally {
        test.setTimeout(test.info().timeout + 20000);
      }
    },
  });
});

test("UI04 cancelled server continuation fails safely without restoring or sending local text", async ({
  page,
}) => {
  await withResource({
    start: () => startChatFixture(),
    use: async (fixture) => {
      try {
        const suspended = await suspendDraft({
          page,
          fixture,
          text: "Failed continuation must discard this",
        });
        await modalLogin(page, fixture.alice);
        expect(
          (
            await page.request.delete(
              `https://localhost/api/auth/continuation/${suspended.intentId}`,
              { headers: { origin: "https://localhost" } },
            )
          ).status(),
        ).toBe(200);
        await page.getByRole("link", { name: "Continue", exact: true }).click();
        await expect(page.locator("body")).toContainText(
          "This action is no longer available.",
        );
        await expect(
          page.getByRole("link", { name: "Continue", exact: true }),
        ).toHaveCount(0);
        await expect(page.getByTestId("message-composer")).toHaveCount(0);
        expect(
          await (
            await fetch(
              `${fixture.url}/canonical?conversationId=${suspended.conversationId}`,
            )
          ).json(),
        ).toEqual([]);
      } finally {
        test.setTimeout(test.info().timeout + 20000);
      }
    },
  });
});

test("UI04 explicit logout in a second tab discards first-tab live draft before same-owner login", async ({
  page,
  context,
}) => {
  const teardownBaseTimeoutMs = test.info().timeout;
  await withResource({
    start: () => startChatFixture(),
    use: async (fixture) => {
      try {
        await withResource({
          start: async () => {
            const second = await context.newPage();
            return { second, dispose: () => second.close() };
          },
          use: async ({ second }) => {
            try {
              await loginChatUser(page, fixture.alice);
              const url = await openChat(page, fixture.bob.username);
              const conversationId = new URL(url).pathname.split("/").at(-1);
              await page
                .getByTestId("message-composer")
                .fill("Discard this on explicit peer logout");
              await second.goto("https://localhost/");
              await expect(second.getByTestId("current-actor")).toHaveText(
                fixture.alice.username,
              );
              await second
                .getByRole("button", { name: /^Account menu:/ })
                .click();
              await second
                .getByRole("menuitem", { name: "Sign out", exact: true })
                .click();
              await expect(second.getByTestId("current-actor")).toHaveCount(0);
              await expect(page.getByTestId("current-actor")).toHaveCount(0);
              await modalLogin(page, fixture.alice);
              await expect(
                page.getByRole("link", { name: "Continue", exact: true }),
              ).toHaveCount(0);
              await expect(page.getByTestId("message-composer")).toHaveValue(
                "",
              );
              expect(
                await (
                  await fetch(
                    `${fixture.url}/canonical?conversationId=${conversationId}`,
                  )
                ).json(),
              ).toEqual([]);
              await page
                .getByRole("button", { name: /^Account menu:/ })
                .click();
              await page
                .getByRole("menuitem", { name: "Sign out", exact: true })
                .click();
              await expect(page.getByTestId("current-actor")).toHaveCount(0);
              await expect(page.getByRole("dialog")).toHaveCount(0);
              await expect(page.locator('input[type="password"]')).toHaveCount(
                0,
              );
            } finally {
              test.setTimeout(teardownBaseTimeoutMs + 20000);
            }
          },
        });
      } finally {
        test.setTimeout(teardownBaseTimeoutMs + 20000);
      }
    },
  });
});
