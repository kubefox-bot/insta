import { z } from "zod";
import { messages } from "../../../apps/fe-insta/src/lib/i18n/index";
import { startAuthFixture } from "../../fixtures/auth05/browser";
import {
  logoutUser,
  openLanguageSettings,
  selectLocale,
} from "../../fixtures/auth05/ui";
import { ageOwnedQueue } from "../../fixtures/chat05/queue";
import {
  loginChatUser,
  openChat,
  seedChatMessages,
} from "../../fixtures/chat05/ui";
import { withResource } from "../../fixtures/lifecycle/with-resource";
import type {} from "../../fixtures/outbox/browser";
import { installOutboxProbe } from "../../fixtures/outbox/install-browser";
import { readRegistrationCode } from "../auth/lib/ui-recovery";
import { captureMatrix, captureViewport } from "./lib/capture";
import { expectConversationColumns } from "./lib/layout";
import { expect, test } from "./lib/test";

test.use({ reducedMotion: "reduce" });

for (const locale of ["en", "ru"] as const) {
  test.describe(locale, () => {
    test.use({ locale: locale === "en" ? "en-US" : "ru-RU" });
    test(`UI05 ${locale} guest layout, modal validation and local font availability`, async ({
      page,
    }, info) => {
      test.setTimeout(90000);
      const copy = messages[locale];
      await page.goto("https://localhost/conversations");
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      for (const width of [1440, 768, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await captureViewport({ page, info, name: `${locale}-guest-${width}` });
        await expect(page.getByTestId("message-composer")).toHaveCount(0);
        const heading = page.getByRole("heading", {
          name: copy.conversations.welcomeTitle,
          exact: true,
        });
        expect(
          await heading.evaluate((element) =>
            Number.parseFloat(getComputedStyle(element).fontSize),
          ),
        ).toBeLessThanOrEqual(24);
      }
      await page.setViewportSize({ width: 305, height: 900 });
      await captureViewport({ page, info, name: `${locale}-guest-content305` });
      await page
        .getByRole("button", { name: copy.consent.necessaryOnly, exact: true })
        .scrollIntoViewIfNeeded();
      await expect(
        page.getByRole("button", {
          name: copy.consent.necessaryOnly,
          exact: true,
        }),
      ).toBeInViewport();
      await captureViewport({
        page,
        info,
        name: `${locale}-consent-bottom-305`,
      });
      await page.goto("https://localhost/");
      await captureMatrix({ page, info, name: `${locale}-welcome` });
      const font = await page.evaluate(async () => {
        try {
          const face = new FontFace("AcceptanceLocalInter", 'local("Inter")');
          await face.load();
          return { localInter: true, status: face.status };
        } catch {
          return { localInter: false, status: "local face unavailable" };
        }
      });
      console.log(
        JSON.stringify({ fontProbe: font, browser: info.project.name, locale }),
      );
      await page
        .getByRole("banner")
        .getByRole("link", { name: copy.navigation.signIn, exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(
        page.getByRole("textbox", { name: copy.auth.email, exact: true }),
      ).toBeFocused();
      for (const width of [1440, 768, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await captureViewport({ page, info, name: `${locale}-modal-${width}` });
      }
      await page
        .getByRole("textbox", { name: copy.auth.email, exact: true })
        .fill("invalid");
      await page
        .getByLabel(copy.auth.password, { exact: true })
        .fill("synthetic invalid input");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: copy.navigation.signIn, exact: true })
        .click();
      expect(
        await page
          .getByRole("textbox", { name: copy.auth.email, exact: true })
          .evaluate(
            (element) =>
              element instanceof HTMLInputElement && !element.validity.valid,
          ),
      ).toBe(true);
      await page
        .getByRole("textbox", { name: copy.auth.email, exact: true })
        .fill("missing-ui05@example.test");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: copy.navigation.signIn, exact: true })
        .click();
      await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
      await captureMatrix({ page, info, name: `${locale}-validation-error` });
    });

    test.describe("private layouts", () => {
      // Login uses the English dialog; the UI changes locale below.
      test.use({ locale: "en-US" });
      test(`UI05 ${locale} private layouts, long messages, offline and manual confirmation`, async ({
        page,
        context,
        chatFixture: fixture,
      }, info) => {
        test.setTimeout(120000);
        const copy = messages[locale];
        await loginChatUser(page, fixture.alice);
        const url = await openChat(page, fixture.bob.username);
        await seedChatMessages({
          page,
          url,
          texts: ["ДлинныйТекстБезПробелов".repeat(80)],
        });
        await page
          .getByRole("banner")
          .getByRole("button", {
            name: locale === "en" ? "English" : "Русский",
            exact: true,
          })
          .click();
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await page.goto(url);
        for (const width of [1440, 768, 390, 320]) {
          await page.setViewportSize({ width, height: 900 });
          await expect(page.getByTestId("message-composer")).toBeEditable();
          await expect(
            page.getByTestId("message-list").locator("[data-message-id]"),
          ).toHaveCount(1);
          await expectConversationColumns({ page, width });
          await expect(
            page.getByTestId("conversation-header").getByRole("heading"),
          ).toHaveText(fixture.bob.username);
          await expect(
            page.getByText(copy.conversations.privateNotice, { exact: true }),
          ).toHaveCount(0);
          await captureViewport({
            page,
            info,
            name: `${locale}-chat-${width}`,
          });
          await page.getByTestId("message-composer").scrollIntoViewIfNeeded();
          await captureViewport({
            page,
            info,
            name: `${locale}-composer-${width}`,
          });
          await page
            .getByRole("button", { name: copy.conversations.send, exact: true })
            .scrollIntoViewIfNeeded();
          await expect(
            page.getByRole("button", {
              name: copy.conversations.send,
              exact: true,
            }),
          ).toBeInViewport();
          await captureViewport({
            page,
            info,
            name: `${locale}-send-bottom-${width}`,
          });
        }
        await page
          .getByRole("link", { name: copy.common.back, exact: true })
          .click();
        await expect(page).toHaveURL(/\/conversations\/?$/);
        await captureViewport({
          page,
          info,
          name: `${locale}-mobile-list-320`,
        });
        const navigationSession = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/session" &&
            response.status() === 200,
        );
        await page.getByTestId("conversation-link").click();
        await (await navigationSession).finished();
        await expect(page.getByTestId("message-composer")).toBeEditable();
        await context.setOffline(true);
        await page
          .getByTestId("message-composer")
          .fill("UI05 offline synthetic draft");
        await page.getByTestId("message-composer").press("Enter");
        await expect(page.getByTestId("pending-message")).toContainText(
          "UI05 offline synthetic draft",
        );
        expect(await page.evaluate(() => navigator.onLine)).toBe(false);
        await expect(page.getByTestId("pending-message")).toContainText(
          copy.conversations.waitingForNetwork,
        );
        await captureMatrix({ page, info, name: `${locale}-offline` });
        await ageOwnedQueue({ page, ownerId: fixture.alice.id });
        await context.setOffline(false);
        await page.reload();
        await expect(
          page
            .getByTestId("pending-message")
            .getByRole("button", { name: copy.outbox.resume, exact: true }),
        ).toBeVisible();
        await captureMatrix({ page, info, name: `${locale}-manual-confirm` });
        await expect(
          page
            .getByTestId("message-list")
            .getByText("UI05 offline synthetic draft", { exact: true }),
        ).toHaveCount(0);
      });
    });
  });
}

test("UI05 real keyboard header activation and Escape restores initiating focus", async ({
  page,
}) => {
  await page.goto("https://localhost/");
  const signIn = page
    .getByRole("banner")
    .getByRole("link", { name: "Sign in", exact: true });
  for (
    let index = 0;
    index < 12 &&
    !(await signIn.evaluate((element) => document.activeElement === element));
    index++
  ) {
    await page.keyboard.press("Tab");
  }
  await expect(signIn).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Email", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(signIn).toBeFocused();
  await page.keyboard.press("Enter");
  const createAccount = page
    .getByRole("dialog")
    .getByRole("link", { name: "No account? Create account", exact: true });
  await createAccount.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("https://localhost/");
  await expect(
    page.getByRole("dialog", { name: "Create account", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Get code", exact: true }),
  ).toBeVisible();
});

test.describe("native private SSR", () => {
  test.use({
    secondaryContextOptions: { javaScriptEnabled: false, locale: "en-US" },
  });
  test("UI05 native private SSR contains persisted history without hydration", async ({
    page,
    chatFixture: fixture,
    secondaryContext: native,
  }, info) => {
    test.setTimeout(90000);
    const reader = await native.newPage();
    await loginChatUser(page, fixture.alice);
    const url = await openChat(page, fixture.bob.username);
    await seedChatMessages({
      page,
      url,
      texts: ["UI05 canonical private SSR history"],
    });
    await loginChatUser(reader, fixture.alice, "native");
    const response = await reader.goto(url);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toBe("no-store");
    await expect(reader.getByTestId("message-list")).toContainText(
      "UI05 canonical private SSR history",
    );
    await expect(
      reader.getByTestId("conversation-panel").getByRole("alert"),
    ).toHaveCount(0);
    await expect(
      reader.getByText("No messages yet", { exact: true }),
    ).toHaveCount(0);
    const html = await response?.text();
    expect(html).toContain("UI05 canonical private SSR history");
    for (const secret of [
      "accessToken",
      "refreshToken",
      "revokeSecret",
      "bindingId",
    ])
      expect(html).not.toContain(secret);
    await captureViewport({
      page: reader,
      info,
      name: "private-native-SSR",
      mode: "native",
    });
  });
});

test("UI05 explicit send reaches the second user and persisted history once", async ({
  page,
  chatFixture: fixture,
  secondaryContext: peer,
}) => {
  test.setTimeout(90000);
  const bob = await peer.newPage();
  await loginChatUser(page, fixture.alice);
  await loginChatUser(bob, fixture.bob);
  const url = await openChat(page, fixture.bob.username);
  await bob.goto(url);
  await expect(bob.getByTestId("message-composer")).toBeEditable();
  await page
    .getByTestId("message-composer")
    .fill("UI05 explicit canonical send");
  await expect(
    bob.getByTestId("message-list").locator("[data-message-id]"),
  ).toHaveCount(0);
  await page.getByTestId("message-composer").press("Enter");
  await expect(
    bob
      .getByTestId("message-list")
      .getByText("UI05 explicit canonical send", { exact: true }),
  ).toHaveCount(1);
  await expect(page.getByTestId("message-composer")).toHaveValue("");
  await page.reload();
  await expect(
    page
      .getByTestId("message-list")
      .getByText("UI05 explicit canonical send", { exact: true }),
  ).toHaveCount(1);
  const sessionResponse = await page.request.get(
    "https://localhost/api/session",
  );
  expect(sessionResponse.status()).toBe(200);
  const session = await sessionResponse.json();
  const history = await page.request.get(
    `https://localhost/api${new URL(url).pathname}/messages`,
    {
      headers: {
        "X-Expected-Owner-ID": session.data.userId,
        "X-Expected-Login-Generation": session.data.generation,
      },
    },
  );
  expect(history.status()).toBe(200);
  expect((await history.json()).data.items).toMatchObject([
    { text: "UI05 explicit canonical send", sequence: 1 },
  ]);
  await expect(
    page.getByTestId("message-list").locator("[data-message-id]"),
  ).toHaveCount(1);
  await page.context().setOffline(true);
  await page
    .getByTestId("message-composer")
    .fill("UI05 owned durable logout draft");
  await page.getByTestId("message-composer").press("Enter");
  await expect(page.getByTestId("pending-message")).toContainText(
    "UI05 owned durable logout draft",
  );
  await ageOwnedQueue({ page, ownerId: fixture.alice.id });
  await page.context().setOffline(false);
  await page.reload();
  await expect(
    page
      .getByTestId("pending-message")
      .getByRole("button", { name: "Send pending messages", exact: true }),
  ).toBeVisible();
  await installOutboxProbe(page);
  expect(
    await page.evaluate(
      (ownerId) => window.__outboxProbe.list(ownerId),
      fixture.alice.id,
    ),
  ).toHaveLength(1);
  await page.getByTestId("message-composer").fill("UI05 discard on logout");
  await logoutUser(page);
  await expect(
    page.getByRole("banner").getByRole("link", {
      name: "Sign in",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByTestId("message-list")).toHaveCount(0);
  await expect(page.getByTestId("message-composer")).toHaveCount(0);
  expect(
    await page.evaluate(
      (ownerId) => window.__outboxProbe.list(ownerId),
      fixture.alice.id,
    ),
  ).toHaveLength(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("PRIVATE_CLEANUP_FAILED", { exact: true }),
  ).toHaveCount(0);
});

test("UI06 locale changes immediately on the current chat without losing its draft", async ({
  page,
  chatFixture: fixture,
}) => {
  await loginChatUser(page, fixture.alice);
  const url = await openChat(page, fixture.bob.username);
  await page.getByTestId("message-composer").fill("UI06 private unsent draft");
  await selectLocale({ page, locale: "ru" });
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page).toHaveURL(url);
  await expect(page.getByTestId("message-composer")).toHaveValue(
    "UI06 private unsent draft",
  );
  await selectLocale({ page, locale: "en" });
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveURL(url);
  await expect(page.getByTestId("message-composer")).toHaveValue(
    "UI06 private unsent draft",
  );
});

test("UI06 settings menu opens owned privacy and support dialogs and returns keyboard focus", async ({
  page,
}) => {
  await page.goto("https://localhost/conversations");
  const trigger = page.getByRole("button", { name: "Settings", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page
    .getByRole("menuitem", { name: "Cookie settings", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Cookie settings", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page
    .getByRole("menuitem", { name: "Report a problem", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Something went wrong", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL("https://localhost/conversations");
});

test("UI06 auth mode switches over the current page and the brand remains ordinary navigation", async ({
  page,
}) => {
  await page.goto("https://localhost/conversations");
  const current = page.url();
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Sign in", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "No account? Create account", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Create account", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(current);
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Sign in", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(current);
  await page.keyboard.press("Escape");
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Insta", exact: true })
    .click();
  await expect(page).toHaveURL("https://localhost/");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test.describe("UI06 native root authentication", () => {
  test.use({
    secondaryContextOptions: { javaScriptEnabled: false, locale: "en-US" },
  });
  test("root exposes native login and registration while the removed auth route returns 404", async ({
    secondaryContext,
  }) => {
    const page = await secondaryContext.newPage();
    const removed = await page.goto("https://localhost/auth");
    expect(removed?.status()).toBe(404);
    const fallback = await page.goto("https://localhost/?mode=login");
    expect(fallback?.status()).toBe(200);
    await expect(
      page.getByRole("textbox", { name: "Email", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await page
      .locator("main")
      .getByRole("link", { name: "No account? Create account", exact: true })
      .click();
    await expect(page).toHaveURL("https://localhost/?mode=register");
    await expect(
      page.getByRole("button", { name: "Get code", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test("UI06 locale pending state is accessible until the actual server response settles", async ({
  page,
}) => {
  await page.goto("https://localhost/conversations");
  const url = page.url();
  const held = { ready: false };
  const release = Promise.withResolvers<void>();
  await withResource({
    start: async () => ({
      dispose: async () => {
        release.resolve();
        await page.unrouteAll({ behavior: "wait" });
      },
    }),
    use: async () => {
      await page.route("https://localhost/locale", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        const response = await route.fetch();
        held.ready = true;
        await release.promise;
        await route.fulfill({ response });
      });
      const language = await openLanguageSettings(page);
      await language
        .getByRole("button", { name: "Русский", exact: true })
        .click();
      await expect.poll(() => held.ready).toBe(true);
      const form = language.locator('form[action="/locale"]');
      await expect(form).toHaveAttribute("aria-busy", "true");
      await expect(
        form.getByRole("button", { name: "Русский", exact: true }),
      ).toBeDisabled();
      await expect(
        form.getByRole("button", { name: "English", exact: true }),
      ).toBeDisabled();
      release.resolve();
      await expect(page.locator("html")).toHaveAttribute("lang", "ru");
      await expect(form).toHaveAttribute("aria-busy", "false");
      await expect(
        form.getByRole("button", { name: "Русский", exact: true }),
      ).toBeEnabled();
      await expect(page).toHaveURL(url);
    },
  });
});

test.describe("UI06 native selected continuation cancellation", () => {
  test.use({
    secondaryContextOptions: { javaScriptEnabled: false, locale: "en-US" },
  });
  test("authenticated native cancellation has one usable control and retires only selected server intent", async ({
    secondaryContext,
    chatFixture: fixture,
  }) => {
    const page = await secondaryContext.newPage();
    await loginChatUser(page, fixture.alice, "native");
    const owned: string[] = [];
    await withResource({
      start: async () => ({
        dispose: async () => {
          const failures = await Promise.allSettled(
            owned.map(async (id) => {
              const response = await page.request.delete(
                `https://localhost/api/auth/continuation/${id}`,
                { headers: { origin: "https://localhost" } },
              );
              if (response.status() !== 200 && response.status() !== 409)
                throw new Error("Owned continuation cleanup failed");
            }),
          );
          const rejected = failures.filter(
            (result) => result.status === "rejected",
          );
          if (rejected.length)
            throw new AggregateError(
              rejected.map((result) => result.reason),
              "Owned continuation cleanup failed",
            );
        },
      }),
      use: async () => {
        for (const recipientId of [fixture.bob.id, fixture.mallory.id]) {
          const response = await page.request.post(
            "https://localhost/api/auth/continuation",
            {
              headers: { origin: "https://localhost" },
              data: {
                type: "compose_message",
                recipientId,
                operationId: crypto.randomUUID(),
              },
            },
          );
          const intent = z
            .object({ data: z.object({ intentId: z.uuid() }) })
            .parse(await response.json());
          owned.push(intent.data.intentId);
        }
        const selected = owned[0],
          sibling = owned[1];
        if (!selected || !sibling)
          throw new Error("Expected two owned intents");
        await page.goto(`https://localhost/?mode=login&intentId=${selected}`);
        await expect(
          page.getByRole("button", { name: "Cancel", exact: true }),
        ).toHaveCount(1);
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        const retired = await page.request.post(
          `https://localhost/api/auth/continuation/${selected}/resume`,
          { headers: { origin: "https://localhost" } },
        );
        expect(retired.status()).toBe(409);
        const remaining = await page.request.delete(
          `https://localhost/api/auth/continuation/${sibling}`,
          { headers: { origin: "https://localhost" } },
        );
        expect(remaining.status()).toBe(200);
      },
    });
  });
});

test("UI07 native credentials entered before hydration survive the modal upgrade", async ({
  page,
}) => {
  const release = Promise.withResolvers<void>();
  const held = { count: 0 };
  await withResource({
    start: async () => ({
      dispose: async () => {
        release.resolve();
        await page.unrouteAll({ behavior: "wait" });
      },
    }),
    use: async () => {
      await page.route("**/_app/immutable/entry/*.js", async (route) => {
        if (route.request().resourceType() !== "script")
          return route.continue();
        held.count++;
        await release.promise;
        await route.continue();
      });
      await page.goto("https://localhost/?mode=login", {
        waitUntil: "domcontentloaded",
      });
      await expect.poll(() => held.count).toBeGreaterThan(0);
      const email = "early-input@example.test";
      const password = "synthetic-prehydration-password";
      await page
        .locator("main")
        .getByRole("textbox", { name: "Email", exact: true })
        .fill(email);
      await page
        .locator("main")
        .getByLabel("Password", { exact: true })
        .fill(password);
      release.resolve();
      const dialog = page.getByRole("dialog", { name: "Sign in", exact: true });
      await expect(dialog).toBeVisible();
      await expect
        .poll(
          async () =>
            (await dialog
              .getByRole("textbox", { name: "Email", exact: true })
              .inputValue()) === email,
        )
        .toBe(true);
      await expect
        .poll(
          async () =>
            (await dialog
              .getByLabel("Password", { exact: true })
              .inputValue()) === password,
        )
        .toBe(true);
      await page.keyboard.press("Escape");
      await expect(page.locator('input[type="password"]')).toHaveCount(0);
    },
  });
});

test("UI07 unknown session outcome opens only the technical dialog over root fallback", async ({
  page,
}) => {
  await withResource({
    start: async () => ({
      dispose: () => page.unrouteAll({ behavior: "wait" }),
    }),
    use: async () => {
      await page.route("**/api/session", (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            error: { code: "SESSION_UNAVAILABLE" },
          }),
        }),
      );
      await page.goto("https://localhost/?mode=login");
      await expect(page.getByTestId("support-error-code")).toHaveText(
        "SESSION_UNAVAILABLE",
      );
      await expect(
        page.getByRole("dialog", { includeHidden: true }),
      ).toHaveCount(1);
      await expect(
        page.getByRole("dialog", {
          name: "Sign in",
          exact: true,
          includeHidden: true,
        }),
      ).toHaveCount(0);
      await expect(page.getByRole("banner")).toContainText(
        "The service is temporarily unavailable.",
      );
    },
  });
});

test("UI07 every native registration stage preserves early input during the modal upgrade", async ({
  page,
}) => {
  await withResource({
    start: startAuthFixture,
    use: async (fixture) => {
      const upgrade = async (
        fields: readonly Readonly<{ label: string; value: string }>[],
      ) => {
        const release = Promise.withResolvers<void>();
        let held = false;
        await withResource({
          start: async () => ({
            dispose: async () => {
              release.resolve();
              await page.unrouteAll({ behavior: "wait" });
            },
          }),
          use: async () => {
            await page.route("**/_app/immutable/entry/*.js", async (route) => {
              if (route.request().resourceType() !== "script")
                return route.continue();
              held = true;
              await release.promise;
              await route.continue();
            });
            await page.goto("https://localhost/?mode=register", {
              waitUntil: "domcontentloaded",
            });
            await expect.poll(() => held).toBe(true);
            for (const field of fields)
              await page
                .locator("main")
                .getByLabel(field.label, { exact: true })
                .fill(field.value);
            release.resolve();
            const dialog = page.getByRole("dialog", {
              name: "Create account",
              exact: true,
            });
            await expect(dialog).toBeVisible();
            for (const field of fields) {
              await expect
                .poll(
                  async () =>
                    (await dialog
                      .getByLabel(field.label, { exact: true })
                      .inputValue()) === field.value,
                )
                .toBe(true);
            }
            await page.keyboard.press("Escape");
            await expect(
              page.getByRole("dialog", { name: "Create account", exact: true }),
            ).toHaveCount(0);
            await expect(page.locator('input[type="password"]')).toHaveCount(0);
          },
        });
      };
      await upgrade([{ label: "Your email", value: fixture.signupEmail }]);
      const started = await page.request.post(
        "https://localhost/?mode=register",
        {
          headers: { origin: "https://localhost" },
          form: { step: "start", email: fixture.signupEmail },
        },
      );
      expect(started.status()).toBe(200);
      const code = await readRegistrationCode({
        email: fixture.signupEmail,
        hostMailpitUrl: fixture.hostMailpitUrl,
      });
      await upgrade([{ label: "Code from your email", value: code }]);
      const verified = await page.request.post(
        "https://localhost/?mode=register",
        {
          headers: { origin: "https://localhost" },
          form: { step: "verify", code },
        },
      );
      expect(verified.status()).toBe(200);
      await upgrade([
        { label: "How people will find you", value: "EarlyRegistration" },
        { label: "Password", value: "synthetic-early-registration-password" },
      ]);
    },
  });
});
