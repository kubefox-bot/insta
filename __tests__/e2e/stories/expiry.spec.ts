import { expect, test } from "../../fixtures/browser-egress/test";
import { withResource } from "../../fixtures/lifecycle/with-resource";
import { startStoryFixture } from "../../fixtures/stories/browser";
import { publishFixtureStories, rejectAutoplay } from "./lib/publication";

test("real run-owned story expiry removes circle and closes player despite loaded media", async ({
  page,
}) => {
  test.setTimeout(60000);
  await withResource({
    start: startStoryFixture,
    use: async (fixture) => {
      const { author, stories } = await publishFixtureStories({
        page,
        account: fixture.account,
        count: 1,
      });
      const story = stories[0];
      if (!story) throw new Error("Fixture story missing");
      expect(
        (
          await fetch(fixture.url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: story.id,
              expiresAt: Date.now() + 7000,
            }),
          })
        ).ok,
      ).toBe(true);
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
      await expect(dialog.locator("video")).toBeVisible();
      await expect
        .poll(() =>
          dialog
            .locator("video")
            .evaluate((node) =>
              node instanceof HTMLVideoElement ? node.readyState : 0,
            ),
        )
        .toBeGreaterThanOrEqual(2);
      await expect(dialog).toHaveCount(0, { timeout: 10000 });
      await expect(circle).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Add a story", exact: true }),
      ).toBeFocused();
      expect(
        (
          await page.request.get(
            `https://localhost/api/stories/${story.id}/playback`,
          )
        ).status(),
      ).toBe(404);
    },
  });
});
