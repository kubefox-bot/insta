import { z } from "zod";
import { startAuthFixture } from "../../fixtures/auth05/browser";
import { expect, test } from "../../fixtures/browser-egress/test";
import { withResource } from "../../fixtures/lifecycle/with-resource";
import { startStoryFixture } from "../../fixtures/stories/browser";
import {
  settleRendererContact,
  withContactRenderer,
} from "../../unit/stories/renderer/browser";
import { readRegistrationCode } from "../auth/lib/ui-recovery";
import { watchPublicRequests } from "./lib/observation";
import { publishFixtureStories, rejectAutoplay } from "./lib/publication";

test("guest SSR exposes only public authors, first display refreshes once; accessible player loads selected video and returns focus", async ({
  page,
}) => {
  test.setTimeout(60000);
  await withResource({
    start: startStoryFixture,
    use: async (fixture) => {
      const { author, stories } = await publishFixtureStories({
        page,
        account: fixture.account,
      });
      await rejectAutoplay(page);
      const calls = watchPublicRequests(page);
      const html = await (await page.request.get("https://localhost/")).text();
      expect(html).toContain(author.username);
      expect(html).not.toContain(fixture.account.email);
      expect(html).not.toContain(fixture.account.password);
      const feed = await (
        await page.request.get("https://localhost/api/stories")
      ).json();
      const group = feed.data.authors.find(
        (value: { author: { id: string } }) => value.author.id === author.id,
      );
      expect(Object.keys(group.author).sort()).toEqual(["id", "username"]);
      expect(Object.keys(group.stories[0]).sort()).toEqual([
        "author",
        "durationMs",
        "expiresAt",
        "id",
        "publishedAt",
      ]);
      await page.goto("https://localhost/");
      const circle = page.getByRole("button", {
        name: `Watch stories by ${author.username}`,
        exact: true,
      });
      await expect(circle).toBeVisible();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect.poll(() => calls.feed).toBe(1);
      await circle.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", {
        name: author.username,
        exact: true,
      });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Play", exact: true }),
      ).toBeVisible();
      expect(calls.playback[0]).toBe(`/api/stories/${stories[0]?.id}/playback`);
      expect(
        calls.playback.every((path) =>
          stories.some((story) => path === `/api/stories/${story.id}/playback`),
        ),
      ).toBe(true);
      const video = dialog.locator("video");
      await expect(video).toHaveAttribute("controls", "");
      await expect
        .poll(() =>
          video.evaluate((node) =>
            node instanceof HTMLVideoElement ? node.readyState : 0,
          ),
        )
        .toBeGreaterThanOrEqual(2);
      await video.evaluate((node) => {
        if (!(node instanceof HTMLVideoElement))
          throw new Error("Video missing");
        node.currentTime = 0.4;
        node.volume = 0.5;
        node.muted = false;
      });
      await expect
        .poll(() =>
          video.evaluate((node) =>
            node instanceof HTMLVideoElement ? node.currentTime : 0,
          ),
        )
        .toBeGreaterThanOrEqual(0.3);
      await dialog
        .getByRole("button", { name: "Next story", exact: true })
        .click();
      await expect(
        dialog.getByRole("button", { name: "Previous story", exact: true }),
      ).toBeEnabled();
      await dialog
        .getByRole("button", { name: "Previous story", exact: true })
        .click();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(circle).toBeFocused();
      expect(calls.publish).toBe(0);
    },
  });
});

test("late Write success after close/reopen does not close the next author renderer", async ({
  page,
}) => {
  test.setTimeout(60000);
  await withContactRenderer(page, async () => {
    await page.getByRole("button", { name: "Open A", exact: true }).click();
    const first = page.getByRole("dialog", {
      name: "RendererAuthorA",
      exact: true,
    });
    await first
      .getByRole("button", { name: "Write to author", exact: true })
      .click();
    await expect(page.getByTestId("contact-calls")).toHaveText('["author-a"]');
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Open B", exact: true }).click();
    const second = page.getByRole("dialog", {
      name: "RendererAuthorB",
      exact: true,
    });
    await settleRendererContact(page, "resolve-first");
    await expect(second).toBeVisible();
    await expect(
      second.getByRole("button", { name: "Write to author", exact: true }),
    ).toBeEnabled();
  });
});

test("late Write rejection after same-author reopen preserves current pending and error renderer state", async ({
  page,
}) => {
  test.setTimeout(60000);
  await withContactRenderer(page, async () => {
    await page.getByRole("button", { name: "Open A", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "RendererAuthorA",
      exact: true,
    });
    const write = dialog.getByRole("button", {
      name: "Write to author",
      exact: true,
    });
    await write.click();
    await expect(page.getByTestId("contact-calls")).toHaveText('["author-a"]');
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Open A", exact: true }).click();
    await settleRendererContact(page, "reject-first");
    await expect(
      dialog.getByText("Could not start this conversation.", { exact: true }),
    ).toHaveCount(0);
    await expect(write).toBeEnabled();
    await write.click();
    await expect(page.getByTestId("contact-calls")).toHaveText(
      '["author-a","author-a"]',
    );
    await expect(write).toBeDisabled();
    await settleRendererContact(page, "reject-second");
    await expect(write).toBeEnabled();
    await expect(
      dialog.getByText("Could not start this conversation.", { exact: true }),
    ).toBeVisible();
  });
});

test("stale Write finally cannot clear a newer author request pending state", async ({
  page,
}) => {
  test.setTimeout(60000);
  await withContactRenderer(page, async () => {
    await page.getByRole("button", { name: "Open A", exact: true }).click();
    await page
      .getByRole("dialog", { name: "RendererAuthorA", exact: true })
      .getByRole("button", { name: "Write to author", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Open B", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "RendererAuthorB",
      exact: true,
    });
    const write = dialog.getByRole("button", {
      name: "Write to author",
      exact: true,
    });
    await expect(write).toBeEnabled();
    await write.click();
    await expect(page.getByTestId("contact-calls")).toHaveText(
      '["author-a","author-b"]',
    );
    await settleRendererContact(page, "reject-first");
    await expect(write).toBeDisabled();
    await expect(
      dialog.getByText("Could not start this conversation.", { exact: true }),
    ).toHaveCount(0);
    await settleRendererContact(page, "resolve-second");
    await expect(dialog).toHaveCount(0);
  });
});

test("explicit Play handles autoplay rejection; ended advances within author and last video closes", async ({
  page,
}) => {
  test.setTimeout(60000);
  await withResource({
    start: startStoryFixture,
    use: async (fixture) => {
      const { author } = await publishFixtureStories({
        page,
        account: fixture.account,
      });
      await rejectAutoplay(page);
      await page.goto("https://localhost/");
      const circle = page.getByRole("button", {
        name: `Watch stories by ${author.username}`,
        exact: true,
      });
      await circle.click();
      const dialog = page.getByRole("dialog", {
        name: author.username,
        exact: true,
      });
      await dialog.getByRole("button", { name: "Play", exact: true }).click();
      await expect(
        dialog.getByRole("button", { name: "Previous story", exact: true }),
      ).toBeEnabled();
      await dialog.getByRole("button", { name: "Play", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(circle).toBeFocused();
    },
  });
});

test("selected public author survives real guest registration and Continue without sending a message", async ({
  page,
}) => {
  test.setTimeout(60000);
  await withResource({
    start: startStoryFixture,
    use: async (fixture) => {
      await withResource({
        start: startAuthFixture,
        use: async (registration) => {
          const { author } = await publishFixtureStories({
            page,
            account: fixture.account,
            count: 1,
          });
          await rejectAutoplay(page);
          await page.goto("https://localhost/");
          await page
            .getByRole("button", {
              name: `Watch stories by ${author.username}`,
              exact: true,
            })
            .click();
          const created = page.waitForResponse(
            (response) =>
              response.request().method() === "POST" &&
              new URL(response.url()).pathname === "/api/auth/continuation",
          );
          await page
            .getByRole("button", { name: "Write to author", exact: true })
            .click();
          const response = await created;
          expect(response.status()).toBe(200);
          expect(response.request().postDataJSON()).toMatchObject({
            type: "open_conversation",
            recipientId: author.id,
          });
          await expect(
            page.getByRole("dialog", { name: "Sign in", exact: true }),
          ).toBeVisible();
          await expect(
            page.getByRole("dialog", { name: author.username, exact: true }),
          ).toHaveCount(0);
          await page
            .getByRole("dialog", { name: "Sign in", exact: true })
            .getByRole("link", { name: "Create account", exact: true })
            .click();
          await page
            .getByRole("textbox", { name: "Email", exact: true })
            .fill(registration.signupEmail);
          await page
            .getByRole("button", { name: "Send code", exact: true })
            .click();
          await page
            .getByRole("textbox", { name: "Verification code", exact: true })
            .fill(
              await readRegistrationCode({
                email: registration.signupEmail,
                hostMailpitUrl: registration.hostMailpitUrl,
              }),
            );
          await page
            .getByRole("button", { name: "Verify email", exact: true })
            .click();
          const username = `S${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
          await page
            .getByRole("textbox", { name: "Username", exact: true })
            .fill(username);
          await page
            .getByLabel("Password", { exact: true })
            .fill(registration.account.password);
          await page
            .getByRole("button", { name: "Finish registration", exact: true })
            .click();
          await expect(page.getByTestId("current-actor")).toHaveText(username);
          await expect(page.getByTestId("message-composer")).toHaveCount(0);
          await page
            .getByRole("link", { name: "Continue", exact: true })
            .click();
          await expect(page).toHaveURL(/\/conversations\/[a-f0-9]{24}$/);
          await expect(
            page
              .getByTestId("conversation-link")
              .filter({ hasText: author.username }),
          ).toHaveAttribute("aria-current", "page");
          await expect(page.getByTestId("message-composer")).toHaveValue("");
          await expect(
            page.getByTestId("message-list").locator("[data-message-id]"),
          ).toHaveCount(0);
          const actor = z
            .object({ data: z.object({ userId: z.string() }) })
            .parse(
              await (
                await page.request.get("https://localhost/api/session")
              ).json(),
            );
          const conversationId = new URL(page.url()).pathname.split("/").at(-1);
          const canonical = await fetch(
            `${fixture.url}/canonical?conversationId=${conversationId}`,
          );
          expect(canonical.status).toBe(200);
          const persisted = z
            .object({
              participantIds: z.array(z.string()),
              messages: z.array(z.string()),
            })
            .parse(await canonical.json());
          expect(persisted.participantIds.sort()).toEqual(
            [author.id, actor.data.userId].sort(),
          );
          expect(persisted.messages).toEqual([]);
        },
      });
    },
  });
});

test("rendered WebM player uses verified horizon despite infinite metadata and ignores released selection events", async ({
  page,
}) => {
  await withResource({
    start: startStoryFixture,
    use: async (fixture) => {
      const { author, stories } = await publishFixtureStories({
        page,
        account: fixture.account,
        media: "webm",
      });
      await rejectAutoplay(page);
      await page.goto("https://localhost/");
      const circle = page.getByRole("button", {
        name: `Watch stories by ${author.username}`,
        exact: true,
      });
      await circle.click();
      const dialog = page.getByRole("dialog", {
        name: author.username,
        exact: true,
      });
      await expect(
        dialog.getByRole("button", { name: "Play", exact: true }),
      ).toBeVisible();
      const first = await dialog.locator("video").elementHandle();
      const firstStory = stories[0];
      if (!first || !firstStory)
        throw Error("First rendered selection missing");
      await first.evaluate((node, durationMs) => {
        if (!(node instanceof HTMLVideoElement))
          throw Error("Native video missing");
        Object.defineProperty(node, "duration", {
          configurable: true,
          value: Infinity,
        });
        Object.defineProperty(node, "currentTime", {
          configurable: true,
          value: durationMs / 2000,
        });
        node.dispatchEvent(new Event("timeupdate"));
      }, firstStory.durationMs);
      await expect(dialog.locator("progress").first()).toHaveJSProperty(
        "value",
        0.5,
      );
      await first.evaluate((node, durationMs) => {
        Object.defineProperty(node, "currentTime", {
          configurable: true,
          value: durationMs / 1000,
        });
        node.dispatchEvent(new Event("timeupdate"));
      }, firstStory.durationMs);
      await expect(
        dialog.getByRole("button", { name: "Previous story", exact: true }),
      ).toBeEnabled();
      await expect(
        dialog.getByRole("button", { name: "Play", exact: true }),
      ).toBeVisible();
      expect(await first.getAttribute("src")).toBeNull();
      expect(
        await first.evaluate(
          (node) => node instanceof HTMLVideoElement && node.paused,
        ),
      ).toBe(true);
      await first.evaluate((node) => {
        for (const event of ["timeupdate", "ended", "error", "loadeddata"])
          node.dispatchEvent(new Event(event));
      });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator("progress").nth(1)).toHaveJSProperty(
        "value",
        0,
      );
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(circle).toBeFocused();
      await first.dispose();
    },
  });
});
