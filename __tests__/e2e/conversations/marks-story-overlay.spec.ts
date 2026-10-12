import { expect } from "../../fixtures/browser-egress/test";
import { startChatFixture } from "../../fixtures/chat05/browser";
import {
  loginChatUser,
  openChat,
  seedChatMessages,
} from "../../fixtures/chat05/ui";
import { withResource } from "../../fixtures/lifecycle/with-resource";
import { startStoryFixture } from "../../fixtures/stories/browser";
import {
  publishFixtureStories,
  rejectAutoplay,
} from "../stories/lib/publication";
import {
  browserState,
  readMarks,
  recordAcknowledgments,
} from "./marks/evidence";
import { test } from "./marks/native/test";

// Enrolled only in Full by the acceptance scope owner; missing Stories fails here.
// Native focus is essential: headless focus emulation cannot prove read receipts.
test.use({ headless: false, locale: "en-US" });

test("G01 native player blocks persisted reads until close and only visible messages are acknowledged", async ({
  page,
  nativeRecipient,
}) => {
  test.setTimeout(120000);
  await withResource({
    start: startStoryFixture,
    use: async (stories) => {
      const { author } = await publishFixtureStories({
        page,
        account: stories.account,
        count: 1,
      });
      await withResource({
        start: startChatFixture,
        use: async (fixture) => {
          const bob = await nativeRecipient.context.newPage();
          try {
            await rejectAutoplay(bob);
            await bob.setViewportSize({ width: 1440, height: 900 });
            await loginChatUser(page, fixture.alice);
            const url = await openChat(page, fixture.bob.username);
            await loginChatUser(bob, fixture.bob);
            await bob.goto(url);
            await bob.bringToFront();
            await bob
              .getByRole("button", {
                name: `Watch stories by ${author.username}`,
                exact: true,
              })
              .click();
            const player = bob.getByRole("dialog", {
              name: author.username,
              exact: true,
            });
            await expect(player).toBeVisible();
            await expect(
              player.getByRole("button", { name: "Play", exact: true }),
            ).toBeVisible();
            expect(await browserState(bob)).toEqual({
              visibility: "visible",
              focused: true,
            });
            const acknowledgments = recordAcknowledgments(bob);
            await seedChatMessages({
              page,
              url,
              texts: Array.from(
                { length: 52 },
                (_, index) => `Overlay incoming ${index + 1}`,
              ),
            });
            const snapshot = () =>
              readMarks({ fixtureUrl: fixture.url, conversationUrl: url });
            // Persisted delivery is the barrier proving messages reached the obscured list.
            await expect
              .poll(async () => (await snapshot()).receipts.length)
              .toBe(52);
            const obscured = await snapshot();
            expect(
              obscured.receipts.every(
                (receipt) =>
                  receipt.deliveredAt !== null && receipt.readAt === null,
              ),
            ).toBe(true);
            expect(
              acknowledgments.filter((batch) => batch.status === "read"),
            ).toEqual([]);
            await expect(player).toBeVisible();
            await bob.keyboard.press("Escape");
            await expect(player).toBeHidden();
            await expect
              .poll(
                async () =>
                  (await snapshot()).receipts.filter(
                    (receipt) => receipt.readAt !== null,
                  ).length,
              )
              .toBeGreaterThan(0);
            const visibleIds = await bob
              .getByTestId("message-list")
              .evaluate((viewport) => {
                const bounds = viewport.getBoundingClientRect();
                return [
                  ...viewport.querySelectorAll<HTMLElement>(
                    "[data-message-id]",
                  ),
                ]
                  .filter((row) => {
                    const rect = row.getBoundingClientRect();
                    return (
                      Math.min(rect.bottom, bounds.bottom, innerHeight) >
                        Math.max(rect.top, bounds.top, 0) &&
                      Math.min(rect.right, bounds.right, innerWidth) >
                        Math.max(rect.left, bounds.left, 0)
                    );
                  })
                  .map((row) => row.dataset.messageId);
              });
            const revealed = await snapshot();
            const read = revealed.receipts.filter(
              (receipt) => receipt.readAt !== null,
            );
            expect(read.length).toBeLessThan(revealed.receipts.length);
            expect(
              read.every((receipt) => visibleIds.includes(receipt.messageId)),
            ).toBe(true);
            expect(
              revealed.receipts
                .filter((receipt) => !visibleIds.includes(receipt.messageId))
                .every((receipt) => receipt.readAt === null),
            ).toBe(true);
          } finally {
            await bob.close();
          }
        },
      });
    },
  });
});
