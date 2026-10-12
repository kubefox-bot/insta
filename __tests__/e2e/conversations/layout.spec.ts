import { logoutUser, selectLocale } from "../../fixtures/auth05/ui";
import { expect, test } from "../../fixtures/browser-egress/test";
import { startChatFixture } from "../../fixtures/chat05/browser";
import {
  loginChatUser,
  openChat,
  seedChatMessages,
} from "../../fixtures/chat05/ui";
import { withResource } from "../../fixtures/lifecycle/with-resource";

test("desktop_thread_precedes_right_sidebar", async ({ page }) => {
  test.setTimeout(90000);
  await withResource({
    start: () => startChatFixture(),
    use: async (fixture) => {
      await loginChatUser(page, fixture.alice);
      await openChat(page, fixture.bob.username);
      await page.reload();
      await expect(
        page.getByTestId("conversation-header").getByRole("heading"),
      ).toHaveText(fixture.bob.username);
      await expect(page.getByTestId("conversation-link")).toHaveAccessibleName(
        fixture.bob.username,
      );
      await expect(
        page
          .getByTestId("conversation-link")
          .getByText(fixture.bob.username, { exact: true }),
      ).toHaveText(fixture.bob.username);
      await expect(page.getByTestId("conversation-link")).not.toContainText(
        "Chat with",
      );
      await expect(page.getByTestId("conversation-link")).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(
        page.getByText("Just the two of you", { exact: true }),
      ).toHaveCount(0);
      for (const width of [1440, 768]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.getByTestId("message-composer")).toBeVisible();
        const panel = await page
          .getByTestId("conversation-panel")
          .boundingBox();
        const sidebar = await page
          .getByTestId("conversation-sidebar")
          .boundingBox();
        if (!panel || !sidebar)
          throw new Error("Expected both desktop columns");
        expect(panel.x + panel.width).toBeLessThanOrEqual(sidebar.x);
        expect(sidebar.width).toBeLessThanOrEqual(336);
        expect(
          await page
            .getByTestId("conversation-panel")
            .evaluate((element) =>
              element.nextElementSibling?.getAttribute("data-testid"),
            ),
        ).toBe("conversation-sidebar");
      }
      await expect(page.getByTestId("conversation-link")).not.toContainText(
        fixture.bob.id.slice(-6),
      );
      expect(
        await page
          .getByTestId("message-composer")
          .evaluate((element) => getComputedStyle(element).color),
      ).toBe("rgb(36, 31, 27)");
    },
  });
});

test("mobile_list_detail_preserves_draft", async ({ page }) => {
  test.setTimeout(90000);
  await withResource({
    start: () => startChatFixture(),
    use: async (fixture) => {
      await page.setViewportSize({ width: 320, height: 740 });
      await loginChatUser(page, fixture.alice);
      await openChat(page, fixture.bob.username);
      await expect(page.getByTestId("conversation-panel")).toBeVisible();
      await expect(page.getByTestId("conversation-sidebar")).toHaveCount(1);
      await expect(page.getByTestId("conversation-sidebar")).toBeHidden();
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 740 });
        await expect(page.getByRole("banner")).toBeHidden();
        await expect(
          page.getByRole("region", { name: "Stories", exact: true }),
        ).toBeHidden();
        const composer = await page
          .getByTestId("message-composer")
          .boundingBox();
        const header = await page
          .getByTestId("conversation-header")
          .boundingBox();
        if (!composer || !header)
          throw new Error("Expected compact detail controls");
        expect(header.y).toBeLessThanOrEqual(1);
        expect(composer.y + composer.height).toBeLessThanOrEqual(740);
      }
      await page
        .getByTestId("message-composer")
        .fill("Черновик до явной отправки");
      await page.getByRole("link", { name: "Back", exact: true }).click();
      await expect(page).toHaveURL(/\/conversations\/?$/);
      await expect(page.getByTestId("conversation-panel")).toHaveCount(1);
      await expect(page.getByTestId("conversation-panel")).toBeHidden();
      await expect(page.getByTestId("conversation-link")).toBeVisible();
      await expect(page.getByRole("banner")).toBeVisible();
      await expect(
        page.getByRole("complementary", {
          name: "Cookies and optional analytics",
          exact: true,
        }),
      ).toBeVisible();
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 740 });
        await page.getByTestId("conversation-link").click();
        await expect(page.getByTestId("message-composer")).toHaveValue(
          "Черновик до явной отправки",
        );
        await expect(
          page.getByRole("complementary", {
            name: "Cookies and optional analytics",
            exact: true,
          }),
        ).toBeVisible();
        await page.getByRole("link", { name: "Back", exact: true }).click();
        await expect(page).toHaveURL(/\/conversations\/?$/);
      }
      await page.getByTestId("conversation-link").click();
      await expect(page.getByTestId("message-composer")).toHaveValue(
        "Черновик до явной отправки",
      );
      await expect(
        page.getByTestId("message-list").locator("[data-message-id]"),
      ).toHaveCount(0);
    },
  });
});

test("long_ru_text_stays_inside_viewport", async ({ page }) => {
  test.setTimeout(90000);
  await withResource({
    start: () => startChatFixture(),
    use: async (fixture) => {
      await loginChatUser(page, fixture.alice);
      const url = await openChat(page, fixture.bob.username);
      await seedChatMessages({
        page,
        url,
        texts: ["ДлинныйРусскийТекстБезПробелов".repeat(70)],
      });
      await selectLocale({ page, locale: "ru" });
      await expect(page.locator("html")).toHaveAttribute("lang", "ru");
      await page.goto(url);
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 740 });
        await expect(
          page.getByTestId("message-list").locator("[data-message-id]"),
        ).toHaveCount(1);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(
          await page
            .getByTestId("message-composer")
            .evaluate((element) => element.getBoundingClientRect().height),
        ).toBeGreaterThanOrEqual(44);
        const composer = await page
          .getByTestId("message-composer")
          .boundingBox();
        if (!composer)
          throw new Error("Expected the composer inside the viewport");
        expect(composer.y + composer.height).toBeLessThanOrEqual(740);
      }
    },
  });
});

test("mobile_back_and_reopen_restores_inner_history_anchor", async ({
  page,
}) => {
  test.setTimeout(90000);
  await withResource({
    start: () => startChatFixture(),
    use: async (fixture) => {
      await page.setViewportSize({ width: 390, height: 740 });
      await loginChatUser(page, fixture.alice);
      await page
        .getByRole("button", { name: "Necessary cookies only", exact: true })
        .click();
      await expect(
        page.getByRole("complementary", {
          name: "Cookies and optional analytics",
          exact: true,
        }),
      ).toHaveCount(0);
      const url = await openChat(page, fixture.bob.username);
      await seedChatMessages({
        page,
        url,
        texts: Array.from(
          { length: 40 },
          (_, index) =>
            `Scroll anchor ${index}: ${"visible history line ".repeat(6)}`,
        ),
      });
      await page.reload();
      const viewport = page.getByTestId("message-list");
      await expect
        .poll(() =>
          viewport.evaluate(
            (element) => element.scrollHeight - element.clientHeight,
          ),
        )
        .toBeGreaterThan(100);
      await viewport.evaluate((element) => {
        element.scrollTop = 100;
      });
      await expect
        .poll(() => viewport.evaluate((element) => element.scrollTop))
        .toBe(100);
      await page.getByRole("link", { name: "Back", exact: true }).click();
      await expect(page).toHaveURL(/\/conversations\/?$/);
      await page.getByTestId("conversation-link").click();
      await expect
        .poll(() => viewport.evaluate((element) => element.scrollTop))
        .toBe(100);
      await expect(
        page.getByTestId("conversation-header").getByRole("heading"),
      ).toHaveText(fixture.bob.username);
    },
  });
});

test("discovery_empty_error_retry_and_home_native_actions", async ({
  page,
}) => {
  test.setTimeout(90000);
  await withResource({
    start: () => startChatFixture(),
    use: async (fixture) => {
      await withResource({
        start: async () => ({
          dispose: async () => {
            await page.unrouteAll({ behavior: "wait" });
          },
        }),
        use: async () => {
          await page.setViewportSize({ width: 320, height: 900 });
          await page.goto("https://localhost/conversations");
          const guestAction = await page
            .getByRole("link", {
              name: "Continue to your account",
              exact: true,
            })
            .boundingBox();
          if (!guestAction) throw new Error("Expected guest action");
          expect(guestAction.height).toBeGreaterThanOrEqual(44);
          expect(guestAction.height).toBeLessThanOrEqual(88);
          await page.setViewportSize({ width: 1440, height: 900 });
          await page.goto("https://localhost");
          await expect(
            page.getByRole("link", {
              name: "Start a conversation",
              exact: true,
            }),
          ).toHaveAttribute("href", "/?mode=login");
          await loginChatUser(page, fixture.alice);
          await page.goto("https://localhost");
          await page
            .getByRole("link", { name: "Open your chats", exact: true })
            .click();
          await expect(
            page.getByText("No chats yet", { exact: true }),
          ).toBeVisible();
          await page
            .getByRole("searchbox")
            .fill(`missing-${crypto.randomUUID().slice(0, 8)}`);
          await page
            .getByRole("button", { name: "Search", exact: true })
            .click();
          await expect(
            page.getByText("No users found", { exact: true }),
          ).toBeVisible();
          await page.route("**/api/users*", (route) =>
            route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: { code: "TECHNICAL_PROBLEM" } }),
            }),
          );
          await page.getByRole("searchbox").fill(fixture.bob.username);
          await page
            .getByRole("button", { name: "Search", exact: true })
            .click();
          await expect(page.getByRole("alert")).toContainText(
            "temporarily unavailable",
          );
          await page.unrouteAll({ behavior: "wait" });
          await page
            .getByRole("button", { name: "Try again", exact: true })
            .click();
          await page
            .getByRole("button", { name: fixture.bob.username, exact: true })
            .click();
          await expect(page.getByTestId("message-composer")).toBeVisible();
          await expect(
            page.getByText("No messages yet", { exact: true }),
          ).toBeVisible();
          const historyState = page.locator("[data-history-status]");
          await expect(historyState).toHaveAttribute(
            "data-history-status",
            "ready",
          );
          await expect(page.getByRole("alert")).toHaveCount(0);
          await page.route("**/api/conversations/*/messages*", (route) =>
            route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: { code: "TECHNICAL_PROBLEM" } }),
            }),
          );
          await page.reload();
          await expect(historyState).toHaveAttribute(
            "data-history-status",
            "error",
          );
          await expect(
            page.getByTestId("conversation-panel").getByRole("alert"),
          ).toBeVisible();
          await expect(
            page.getByText("No messages yet", { exact: true }),
          ).toHaveCount(0);
          await page.unrouteAll({ behavior: "wait" });
          await page
            .getByTestId("conversation-panel")
            .getByRole("button", { name: "Try again", exact: true })
            .click();
          await expect(historyState).toHaveAttribute(
            "data-history-status",
            "ready",
          );
          await expect(
            page.getByTestId("conversation-panel").getByRole("alert"),
          ).toHaveCount(0);
          await expect(
            page.getByText("No messages yet", { exact: true }),
          ).toBeVisible();
        },
      });
    },
  });
});

test("IME_and_held_send_preserve_new_draft_and_Unicode_limit", async ({
  page,
}) => {
  test.setTimeout(90000);
  await withResource({
    start: () => startChatFixture(),
    use: async (fixture) => {
      await loginChatUser(page, fixture.alice);
      await openChat(page, fixture.bob.username);
      const composer = page.getByTestId("message-composer");
      await composer.fill("IME draft");
      await composer.dispatchEvent("keydown", {
        key: "Enter",
        isComposing: true,
      });
      await expect(composer).toHaveValue("IME draft");
      await expect(
        page.getByTestId("message-list").locator("[data-message-id]"),
      ).toHaveCount(0);
      await composer.fill("😀".repeat(4000));
      await expect(composer).toHaveValue("😀".repeat(4000));
      await expect(page.getByText("4000/4000", { exact: true })).toBeVisible();
      await page.evaluate(() => {
        const original = IDBObjectStore.prototype.add;
        IDBObjectStore.prototype.add = function (value, key) {
          const request = original.call(this, value, key);
          const transaction = this.transaction;
          const completion = transaction.oncomplete;
          transaction.oncomplete = (event) => {
            document.documentElement.setAttribute("data-send-held", "true");
            document.addEventListener(
              "release-send",
              () => completion?.call(transaction, event),
              { once: true },
            );
          };
          IDBObjectStore.prototype.add = original;
          return request;
        };
      });
      await composer.fill("Submitted draft");
      await composer.press("Enter");
      await expect(page.locator("html")).toHaveAttribute(
        "data-send-held",
        "true",
      );
      await expect(
        page.getByRole("button", { name: "Send", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Send", exact: true }),
      ).toHaveAttribute("aria-busy", "true");
      await composer.fill("New draft during held completion");
      await page.evaluate(() =>
        document.dispatchEvent(new Event("release-send")),
      );
      await expect(
        page.getByRole("button", { name: "Send", exact: true }),
      ).toBeEnabled();
      await expect(composer).toHaveValue("New draft during held completion");
      await expect(
        page
          .getByTestId("message-list")
          .getByText("Submitted draft", { exact: true }),
      ).toHaveCount(1);
    },
  });
});

test("new_messages_and_older_page_preserve_reader_scroll", async ({ page }) => {
  test.setTimeout(120000);
  await withResource({
    start: () => startChatFixture(),
    use: async (fixture) => {
      const release = Promise.withResolvers<void>();
      await withResource({
        start: async () => ({
          dispose: async () => {
            release.resolve();
            await page.unrouteAll({ behavior: "wait" });
          },
        }),
        use: async () => {
          await loginChatUser(page, fixture.alice);
          const url = await openChat(page, fixture.bob.username);
          await seedChatMessages({
            page,
            url,
            texts: Array.from(
              { length: 52 },
              (_, index) =>
                `Reader history ${index + 1}\n${"History line\n".repeat(3)}`,
            ),
          });
          await page.reload();
          const list = page.getByTestId("message-list");
          await expect(list.locator("[data-message-id]")).toHaveCount(50);
          await expect
            .poll(() => list.evaluate((element) => element.scrollTop))
            .toBeGreaterThan(0);
          await list.evaluate((element) => {
            element.scrollTop = 200;
            element.dispatchEvent(new Event("scroll"));
          });
          const before = await list.evaluate((element) => element.scrollTop);
          await seedChatMessages({
            page,
            url,
            texts: ["New message while reading"],
          });
          await expect(
            list.getByText("New message while reading", { exact: true }),
          ).toHaveCount(1);
          await expect(
            page.getByRole("button", { name: "New messages", exact: true }),
          ).toBeVisible();
          expect(await list.evaluate((element) => element.scrollTop)).toBe(
            before,
          );
          await list.evaluate((element) => {
            element.scrollTop = 0;
            element.dispatchEvent(new Event("scroll"));
          });
          const anchor = list.locator("[data-message-id]").first();
          const anchorId = await anchor.getAttribute("data-message-id");
          const anchorBefore = await anchor.boundingBox();
          if (!anchorId || !anchorBefore)
            throw new Error("Expected history anchor");
          const reached = Promise.withResolvers<void>();
          await page.route("**/messages?cursor=*", async (route) => {
            const response = await route.fetch();
            reached.resolve();
            await release.promise;
            await route.fulfill({ response });
          });
          await page
            .getByRole("button", { name: "Load earlier messages", exact: true })
            .click();
          await reached.promise;
          await expect(
            page.getByRole("button", {
              name: "Load earlier messages",
              exact: true,
            }),
          ).toBeDisabled();
          release.resolve();
          await expect(list.locator("[data-message-id]")).toHaveCount(53);
          const anchorAfter = await list
            .locator(`[data-message-id="${anchorId}"]`)
            .boundingBox();
          if (!anchorAfter) throw new Error("Expected retained anchor");
          expect(Math.abs(anchorAfter.y - anchorBefore.y)).toBeLessThanOrEqual(
            2,
          );
          await page
            .getByRole("button", { name: "New messages", exact: true })
            .click();
          await expect
            .poll(() =>
              list.evaluate(
                (element) =>
                  element.scrollHeight -
                  element.scrollTop -
                  element.clientHeight,
              ),
            )
            .toBeLessThanOrEqual(2);
        },
      });
    },
  });
});

test("loaded_directory_names_are_private_and_delayed_results_do_not_cross_owner", async ({
  page,
}) => {
  test.setTimeout(90000);
  await withResource({
    start: () => startChatFixture(),
    use: async (fixture) => {
      const release = Promise.withResolvers<void>();
      await withResource({
        start: async () => ({
          dispose: async () => {
            release.resolve();
            await page.unrouteAll({ behavior: "wait" });
          },
        }),
        use: async () => {
          await loginChatUser(page, fixture.alice);
          await openChat(page, fixture.bob.username);
          await expect(
            page.getByTestId("conversation-panel").getByRole("heading", {
              name: fixture.bob.username,
              exact: true,
            }),
          ).toBeVisible();
          await expect(page.getByTestId("conversation-link")).toContainText(
            fixture.bob.username,
          );
          const reached = Promise.withResolvers<void>();
          await page.route("**/api/users*", async (route) => {
            const response = await route.fetch();
            reached.resolve();
            await release.promise;
            await route.fulfill({ response });
          });
          await page.getByRole("searchbox").fill(fixture.bob.username);
          await page
            .getByRole("button", { name: "Search", exact: true })
            .click();
          await reached.promise;
          await logoutUser(page);
          await expect(page.getByTestId("conversation-panel")).toHaveCount(0);
          await expect(
            page.getByText(fixture.bob.username, { exact: true }),
          ).toHaveCount(0);
          release.resolve();
          await page.unrouteAll({ behavior: "wait" });
          await loginChatUser(page, fixture.mallory);
          await page.goto("https://localhost/conversations");
          await expect(
            page.getByText("No chats yet", { exact: true }),
          ).toBeVisible();
          await expect(
            page.getByText(fixture.bob.username, { exact: true }),
          ).toHaveCount(0);
        },
      });
    },
  });
});

test("compact_composer_icon_and_growing_input_preserve_history_geometry", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await withResource({
    start: () => startChatFixture(),
    use: async (fixture) => {
      await loginChatUser(page, fixture.alice);
      await page
        .getByRole("button", { name: "Necessary cookies only", exact: true })
        .click();
      const url = await openChat(page, fixture.bob.username);
      await seedChatMessages({
        page,
        url,
        texts: ["LongUnbrokenMessage".repeat(120)],
      });
      await page.goto(url);
      const composer = page.getByRole("textbox", {
        name: "Message",
        exact: true,
      });
      const send = page.getByRole("button", { name: "Send", exact: true });
      await expect(page.getByText("Write", { exact: true })).toHaveCount(0);
      await expect(composer).toHaveAttribute("rows", "1");
      await expect(send.locator("svg")).toHaveCount(1);
      await expect(send).toBeDisabled();
      await composer.fill(" \n\t");
      await expect(send).toBeDisabled();
      await expect(page.getByTestId("message-counter")).toHaveCount(0);
      await expect(page.getByTestId("message-list").locator("time")).toHaveText(
        /^\d{2}:\d{2}$/,
      );
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 740 });
        await composer.fill("one row");
        const single = await composer.boundingBox();
        await composer.fill("line\n".repeat(15));
        await expect
          .poll(() =>
            composer.evaluate((node) => node.getBoundingClientRect().height),
          )
          .toBeGreaterThan(single?.height ?? 0);
        const input = await composer.boundingBox();
        const button = await send.boundingBox();
        if (!input || !button)
          throw new Error("Expected inline composer controls");
        expect(button.x).toBeGreaterThanOrEqual(input.x + input.width);
        expect(button.width).toBeGreaterThanOrEqual(44);
        expect(button.height).toBeGreaterThanOrEqual(44);
        expect(input.y + input.height).toBeLessThanOrEqual(740);
        const limit = await composer.evaluate((node) =>
          Math.min(
            Number.parseFloat(getComputedStyle(node).lineHeight) * 6,
            innerHeight * 0.3,
          ),
        );
        expect(input.height).toBeLessThanOrEqual(limit + 1);
        expect(
          await composer.evaluate(
            (node) => node.scrollHeight > node.clientHeight,
          ),
        ).toBe(true);
        await composer.fill("😀".repeat(3599));
        await expect(page.getByTestId("message-counter")).toHaveCount(0);
        await composer.fill("😀".repeat(3600));
        await expect(page.getByTestId("message-counter")).toHaveText(
          "3600/4000",
        );
      }
      await composer.fill("Existing draft\nSecond line");
      const beforeFontChange = await composer.boundingBox();
      if (!beforeFontChange) throw new Error("Expected the existing draft");
      await composer.evaluate((node) => {
        node.style.fontSize = "200%";
      });
      await expect
        .poll(() =>
          composer.evaluate((node) => node.getBoundingClientRect().height),
        )
        .toBeGreaterThan(beforeFontChange.height);
      await expect(composer).toHaveValue("Existing draft\nSecond line");
      expect((await composer.boundingBox())?.width).toBe(
        beforeFontChange.width,
      );
      await composer.fill("ДлинноеСлово".repeat(100));
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await page
          .getByTestId("message-list")
          .evaluate((node) => node.clientHeight),
      ).toBeGreaterThan(0);
    },
  });
});
