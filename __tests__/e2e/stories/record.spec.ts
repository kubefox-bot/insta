import { publishStory200Schema } from "../../../apps/fe-insta/src/lib/api/generated/schemas/publishStorySchema";
import { expect, test } from "../../fixtures/browser-egress/test";
import { openChat, seedChatMessages } from "../../fixtures/chat05/ui";
import { withResource } from "../../fixtures/lifecycle/with-resource";
import { launchWithSyntheticMedia } from "../../fixtures/recorder/launch";
import { startStoryFixture } from "../../fixtures/stories/browser";
import {
  observeCamera,
  openRecorder,
  previewIdentity,
  recordPreview,
} from "./lib/recording";

test.use({
  permissions: ["camera", "microphone"],
  launchOptions: launchWithSyntheticMedia,
});

test("native maximum camera/audio recording passes strict server inspector, explicit publication and necessary-only", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await withResource({
    start: startStoryFixture,
    use: async (fixture) => {
      await observeCamera(page);
      await openRecorder({ page, account: fixture.account });
      expect(
        await page.evaluate(() => sessionStorage.getItem("storyCameraCalls")),
      ).toBeNull();
      await page
        .getByRole("button", {
          name: "Enable camera and microphone",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Start recording", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Publish",
          exact: true,
        }),
      ).toBeVisible({ timeout: 22000 });
      expect(
        await page.evaluate(() => sessionStorage.getItem("storyTrackStops")),
      ).toBe("2");
      await expect(page.locator('video[src^="blob:"]')).toHaveJSProperty(
        "muted",
        true,
      );
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const dialog = page.getByRole("dialog");
        const bounds = await dialog.boundingBox();
        expect(bounds?.x).toBeGreaterThanOrEqual(0);
        expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
          width,
        );
        expect(
          await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
        ).toBe(true);
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            ),
        );
        await page.screenshot({
          path: `.infra/stories-task7/${info.project.name}-preview-${width}.png`,
        });
      }
      const preview = await previewIdentity(page);
      const warmedEmptyFeed = await page.evaluate(async () => {
        const response = await fetch("/api/stories", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const feed = await response.json();
        return response.ok && feed.data.authors.length === 0;
      });
      expect(warmedEmptyFeed).toBe(true);
      await page.route("**/api/stories", async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        const body = route.request().postDataBuffer();
        if (!body) throw new Error("Missing native multipart");
        const form = await new Request(route.request().url(), {
          method: "POST",
          headers: {
            "content-type": route.request().headers()["content-type"] ?? "",
          },
          body: new Uint8Array(body).buffer,
        }).formData();
        const blob = form.get("video");
        if (!(blob instanceof File)) throw new Error("No native video");
        expect(blob.name).toBe("story.webm");
        expect(blob.type).toMatch(/^video\/webm(?:;|$)/);
        expect(
          new Bun.CryptoHasher("sha256")
            .update(await blob.arrayBuffer())
            .digest("hex"),
        ).toBe(preview.hash);
        await Bun.write(
          `.infra/stories-task7/${info.project.name}-autostop.webm`,
          blob,
        );
        console.log(
          JSON.stringify({
            phase: "native-capture",
            channel: info.project.name,
            bytes: blob.size,
            type: blob.type,
            sha256: new Bun.CryptoHasher("sha256")
              .update(await blob.arrayBuffer())
              .digest("hex"),
          }),
        );
        await route.continue();
      });
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/stories") && r.request().method() === "POST",
      );
      await page
        .getByRole("button", {
          name: "Publish",
          exact: true,
        })
        .click();
      const published = await response;
      const publication = publishStory200Schema.parse(await published.json());
      console.log(
        JSON.stringify({
          phase: "native-server-inspection",
          status: published.status(),
          body: publication,
        }),
      );
      expect(published.status()).toBe(200);
      await expect(page.getByRole("status")).toContainText("Story published");
      await expect(
        page.getByRole("button", {
          name: `Watch stories by ${publication.data.author.username}`,
          exact: true,
        }),
      ).toBeVisible();
    },
  });
});

test("manual recording, retake and close release native streams; recorder fits required widths", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await withResource({
    start: startStoryFixture,
    use: async (fixture) => {
      await observeCamera(page);
      await openRecorder({ page, account: fixture.account });
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            ),
        );
        await page.screenshot({
          path: `.infra/stories-task7/${info.project.name}-ready-${width}.png`,
        });
      }
      await recordPreview(page);
      await page
        .getByRole("button", { name: "Record again", exact: true })
        .click();
      expect(
        await page.evaluate(() => sessionStorage.getItem("storyCameraCalls")),
      ).toBe("1");
      await page
        .getByRole("button", {
          name: "Enable camera and microphone",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("button", { name: "Start recording", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: /^(Close|Back)$/, exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(
        await page.evaluate(() => sessionStorage.getItem("storyTrackStops")),
      ).toBe("4");
    },
  });
});

for (const [name, message] of [
  ["NotAllowedError", "Camera or microphone permission was denied"],
  ["NotReadableError", "Camera or microphone unavailable or busy"],
]) {
  test(`controlled ${name} is a camera error and never a publication`, async ({
    page,
  }) => {
    await withResource({
      start: startStoryFixture,
      use: async (fixture) => {
        await page.addInitScript((name) => {
          navigator.mediaDevices.getUserMedia = async () => {
            throw new DOMException("synthetic", name);
          };
        }, name);
        await openRecorder({ page, account: fixture.account });
        const uploads: string[] = [];
        page.on("request", (r) => {
          if (r.url().endsWith("/api/stories") && r.method() === "POST")
            uploads.push(r.url());
        });
        await page
          .getByRole("button", {
            name: "Enable camera and microphone",
            exact: true,
          })
          .click();
        await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
          message ?? "",
        );
        expect(uploads).toHaveLength(0);
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Close", exact: true })
          .click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
      },
    });
  });
}

test("controlled hidden-page cancellation settles both native tracks and keeps future camera activation explicit", async ({
  page,
}) => {
  await withResource({
    start: startStoryFixture,
    use: async (fixture) => {
      await observeCamera(page);
      await openRecorder({ page, account: fixture.account });
      await page
        .getByRole("button", {
          name: "Enable camera and microphone",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Start recording", exact: true })
        .click();
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          get: () => true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect
        .poll(() =>
          page.evaluate(() => sessionStorage.getItem("storyTrackStops")),
        )
        .toBe("2");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          get: () => false,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect(
        page.getByRole("button", {
          name: "Enable again",
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => sessionStorage.getItem("storyCameraCalls")),
      ).toBe("1");
    },
  });
});

test("Russian recorder and preview remain usable at320/390/768/1440 with reduced motion", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await withResource({
    start: startStoryFixture,
    use: async (fixture) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openRecorder({ page, account: fixture.account });
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await page.getByRole("button", { name: "Русский", exact: true }).click();
      await page
        .getByRole("button", { name: "Добавить историю", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Включить камеру и микрофон",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Начать запись", exact: true })
        .click();
      await expect(page.getByRole("dialog").getByRole("status")).toContainText(
        "00:01 / 00:15",
        { timeout: 5000 },
      );
      await page
        .getByRole("button", { name: "Остановить запись", exact: true })
        .click();
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const dialog = page.getByRole("dialog");
        await expect(
          dialog.getByRole("button", {
            name: "Опубликовать",
            exact: true,
          }),
        ).toBeVisible();
        expect(
          await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
        ).toBe(true);
        await expect(page.locator("header")).toHaveCount(1);
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            ),
        );
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            ),
        );
        await page.screenshot({
          path: `.infra/stories-task7/${info.project.name}-ru-preview-${width}.png`,
        });
      }
    },
  });
});

test("creation over a selected chat preserves the mounted list, unsent draft, scroll and invoking focus", async ({
  page,
}) => {
  await withResource({
    start: startStoryFixture,
    use: async (fixture) => {
      expect(
        (
          await page.request.post("https://localhost/api/auth/login", {
            headers: { origin: "https://localhost" },
            data: fixture.secondAccount,
          })
        ).status(),
      ).toBe(200);
      const peer = await (
        await page.request.get("https://localhost/api/session")
      ).json();
      const username = peer.data.username;
      if (typeof username !== "string")
        throw new Error("Fixture peer username missing");
      await openRecorder({ page, account: fixture.account });
      await page
        .getByRole("dialog", { name: "New story", exact: true })
        .getByRole("button", { name: "Close", exact: true })
        .click();
      const url = await openChat(page, username);
      await seedChatMessages({
        page,
        url,
        texts: Array.from(
          { length: 20 },
          (_, index) =>
            `Retained history ${index}\nA second line for a scrollable viewport`,
        ),
      });
      await page.reload();
      const list = page.getByTestId("message-list");
      await expect(list).toContainText("Retained history 0");
      await page
        .getByTestId("message-composer")
        .fill("Unsent selected-chat draft");
      await list.evaluate((node) => {
        node.scrollTop = 100;
        node.setAttribute("data-creation-host", "original");
      });
      const scroll = await list.evaluate((node) => node.scrollTop);
      expect(scroll).toBeGreaterThan(0);
      const trigger = page.getByRole("button", {
        name: "Add a story",
        exact: true,
      });
      await trigger.click();
      await expect(page).toHaveURL(/\/stories\/new\?operationId=/);
      await page
        .getByRole("dialog", { name: "New story", exact: true })
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await expect(page).toHaveURL(url);
      await expect(list).toHaveAttribute("data-creation-host", "original");
      expect(await list.evaluate((node) => node.scrollTop)).toBe(scroll);
      await expect(page.getByTestId("message-composer")).toHaveValue(
        "Unsent selected-chat draft",
      );
      await expect(trigger).toBeFocused();
    },
  });
});
