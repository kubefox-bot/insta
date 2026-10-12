import { expect, test } from "../../fixtures/browser-egress/test";
import { docker } from "../../fixtures/docker";
import { withResource } from "../../fixtures/lifecycle/with-resource";
import { startStoryFixture } from "../../fixtures/stories/browser";
import { publishFixtureStories, rejectAutoplay } from "./lib/publication";

test("actual publication worker logs one canonical goal only for the original all-consent effect", async ({
  page,
}) => {
  test.setTimeout(90000);
  await withResource({
    start: startStoryFixture,
    use: async (fixture) => {
      const since = new Date().toISOString();
      const necessary = await publishFixtureStories({
        page,
        account: fixture.account,
        count: 1,
      });
      await page.goto("https://localhost/");
      await page
        .getByRole("button", { name: "Accept all cookies", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Accept all cookies", exact: true }),
      ).toHaveCount(0);
      const optional = await publishFixtureStories({
        page,
        account: fixture.account,
        count: 1,
      });
      const effectId = optional.stories[0]?.id;
      const necessaryId = necessary.stories[0]?.id;
      if (!effectId || !necessaryId)
        throw new Error("Missing actual publication effects");
      const container = await docker("compose", "ps", "-q", "be-insta");
      const records = async () =>
        (await docker("logs", "--since", since, container))
          .split("\n")
          .filter((line) => line.includes('"event_type":"analytics"'));
      await expect
        .poll(
          async () =>
            (await records()).filter(
              (line) =>
                line.includes(effectId) &&
                line.includes('"goal":"story_published"'),
            ).length,
        )
        .toBe(1);
      const actual = await records();
      expect(actual.filter((line) => line.includes(necessaryId))).toHaveLength(
        0,
      );
      const publication = actual.find((line) => line.includes(effectId));
      expect(publication).toContain('"authority":"server_canonical"');
      expect(publication).toContain('"operation":"story.publish"');
      for (const forbidden of [
        "X-Amz",
        "accessToken",
        ".mp4",
        ".webm",
        "https://",
        "video",
      ])
        expect(publication).not.toContain(forbidden);
    },
  });
});

test("actual playing records only with current all consent; metadata prefetch and necessary playback send no goal", async ({
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
      const goals: {
        events: { analyticsEventId: string; operationId: string }[];
      }[] = [];
      const logStart = new Date().toISOString();
      const optionalRequests: string[] = [];
      page.on("request", (request) => {
        if (
          !request.url().includes("/api/telemetry") ||
          request.method() !== "POST"
        )
          return;
        optionalRequests.push(request.url());
        if (!request.url().endsWith("/api/telemetry")) return;
        const body = request.postDataJSON();
        const played = body.events?.some(
          (event: { operation: string }) => event.operation === "story.play",
        );
        if (played) goals.push(body);
      });
      await page.goto("https://localhost/");
      await page
        .getByRole("button", {
          name: `Watch stories by ${author.username}`,
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog", {
        name: author.username,
        exact: true,
      });
      await expect(
        dialog.getByRole("button", { name: "Play", exact: true }),
      ).toBeVisible();
      expect(goals).toHaveLength(0);
      await dialog.getByRole("button", { name: "Play", exact: true }).click();
      await expect
        .poll(() =>
          dialog
            .locator("video")
            .evaluate((video: HTMLVideoElement) => video.currentTime),
        )
        .toBeGreaterThan(0);
      expect(optionalRequests).toHaveLength(0);
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await page
        .getByRole("button", { name: "Accept all cookies", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: `Watch stories by ${author.username}`,
          exact: true,
        })
        .click();
      await expect(
        dialog.getByRole("button", { name: "Play", exact: true }),
      ).toBeVisible();
      expect(goals).toHaveLength(0);
      await dialog.getByRole("button", { name: "Play", exact: true }).click();
      await expect.poll(() => goals.length).toBe(1);
      const observedId = goals[0]?.events[0]?.analyticsEventId;
      expect(observedId).toBeTruthy();
      const container = await docker("compose", "ps", "-q", "fe-insta");
      await expect
        .poll(async () => {
          const logs = await docker("logs", "--since", logStart, container);
          return logs
            .split("\n")
            .some(
              (line) =>
                line.includes(String(observedId)) &&
                line.includes("story_play_started") &&
                line.includes("client_observed"),
            );
        })
        .toBe(true);
      for (const goal of goals) {
        const serialized = JSON.stringify(goal);
        for (const forbidden of [
          "X-Amz",
          "accessToken",
          ".mp4",
          ".webm",
          "https://",
          "storyId",
        ])
          expect(serialized).not.toContain(forbidden);
      }
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page
        .getByRole("menuitem", { name: "Cookie settings", exact: true })
        .click();
      const settings = page.getByRole("dialog", {
        name: "Cookie settings",
        exact: true,
      });
      await settings
        .getByRole("button", { name: "Necessary cookies only", exact: true })
        .click();
      await expect(settings).toContainText("Only necessary cookies");
      await settings
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: `Watch stories by ${author.username}`,
          exact: true,
        })
        .click();
      await dialog.getByRole("button", { name: "Play", exact: true }).click();
      await expect
        .poll(() =>
          dialog
            .locator("video")
            .evaluate((video: HTMLVideoElement) => video.currentTime),
        )
        .toBeGreaterThan(0);
      expect(goals).toHaveLength(1);
    },
  });
});
