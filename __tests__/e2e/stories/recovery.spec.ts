import { logoutUser } from "../../fixtures/auth05/ui";
import { expect, test } from "../../fixtures/browser-egress/test";
import { withResource } from "../../fixtures/lifecycle/with-resource";
import { launchWithSyntheticMedia } from "../../fixtures/recorder/launch";
import { startStoryFixture } from "../../fixtures/stories/browser";
import { modalLogin } from "../auth/lib/ui-recovery";
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

test("lost publication response retains operation identity through pending and lookup failure until real published status", async ({
  page,
}) => {
  test.setTimeout(60000);
  await withResource({
    start: startStoryFixture,
    use: async (fixture) => {
      await openRecorder({ page, account: fixture.account });
      await recordPreview(page);
      const operations: string[] = [];
      await page.route("**/api/stories", async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        operations.push(route.request().headers()["idempotency-key"] ?? "");
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        await route.abort("failed");
      });
      await page
        .getByRole("button", {
          name: "Publish",
          exact: true,
        })
        .click();
      const check = page.getByRole("button", {
        name: "Check publication",
        exact: true,
      });
      await expect(check).toBeVisible();
      await page.route("**/api/stories/publications/*", (route) =>
        route.fulfill({
          status: 200,
          json: {
            ok: true,
            data: { state: "pending", operationId: operations[0] },
            meta: { requestId: "controlled" },
          },
        }),
      );
      await check.click();
      await expect(
        page.getByRole("button", {
          name: "Retry this publication",
          exact: true,
        }),
      ).toHaveCount(0);
      await page.unroute("**/api/stories/publications/*");
      await page.route("**/api/stories/publications/*", (route) =>
        route.fulfill({ status: 503, json: { ok: false } }),
      );
      await check.click();
      await expect(check).toBeVisible();
      expect(operations).toHaveLength(1);
      await page.unroute("**/api/stories/publications/*");
      await check.click();
      await expect(page.getByRole("status")).toContainText("Story published");
      expect(operations).toHaveLength(1);
    },
  });
});

test("session expiry restores same-owner in-memory preview without camera or publication; reload reports loss", async ({
  page,
}) => {
  test.setTimeout(60000);
  await withResource({
    start: startStoryFixture,
    use: async (fixture) => {
      await observeCamera(page);
      await openRecorder({ page, account: fixture.account });
      await recordPreview(page);
      const original = await previewIdentity(page);
      const publications: string[] = [];
      page.on("request", (r) => {
        if (r.method() === "POST" && r.url().endsWith("/api/stories"))
          publications.push(r.url());
      });
      await page.context().clearCookies({ name: "insta_session" });
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(page.getByTestId("current-actor")).toHaveCount(0);
      await modalLogin(page, fixture.account);
      await page.getByRole("link", { name: "Continue", exact: true }).click();
      await expect(
        page.getByRole("button", {
          name: "Publish",
          exact: true,
        }),
      ).toBeVisible();
      const restored = await previewIdentity(page);
      expect(restored.url).not.toBe(original.url);
      expect(restored.hash).toBe(original.hash);
      expect(publications).toHaveLength(0);
      expect(
        await page.evaluate(() => sessionStorage.getItem("storyCameraCalls")),
      ).toBe("1");
      page.once("dialog", (dialog) => dialog.accept());
      await page.reload();
      await expect(page.locator('video[src^="blob:"]')).toHaveCount(0);
      await expect(
        page.getByRole("button", {
          name: "Enable camera and microphone",
          exact: true,
        }),
      ).toBeVisible();
      expect(publications).toHaveLength(0);
    },
  });
});

test("different account cannot recover previous owner's preview", async ({
  page,
}) => {
  test.setTimeout(60000);
  await withResource({
    start: startStoryFixture,
    use: async (fixture) => {
      await observeCamera(page);
      await openRecorder({ page, account: fixture.account });
      await recordPreview(page);
      await page.context().clearCookies({ name: "insta_session" });
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(page.getByTestId("current-actor")).toHaveCount(0);
      await modalLogin(page, fixture.secondAccount);
      await expect(
        page.getByRole("link", { name: "Continue", exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Add a story", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Enable camera and microphone",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator('video[src^="blob:"]')).toHaveCount(0);
      expect(
        await page.evaluate(() => sessionStorage.getItem("storyCameraCalls")),
      ).toBe("1");
    },
  });
});

test("explicit logout after closing unknown upload destroys its private preview and operation", async ({
  page,
}) => {
  test.setTimeout(60000);
  await withResource({
    start: startStoryFixture,
    use: async (fixture) => {
      await observeCamera(page);
      await openRecorder({ page, account: fixture.account });
      await recordPreview(page);
      await page.route("**/api/stories", (route) =>
        route.request().method() === "POST"
          ? route.abort("failed")
          : route.continue(),
      );
      await page
        .getByRole("button", {
          name: "Publish",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("button", { name: "Check publication", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Leave and check later", exact: true })
        .click();
      await expect(page).toHaveURL("https://localhost/");
      await logoutUser(page);
      await expect(page.getByTestId("current-actor")).toHaveCount(0);
      await modalLogin(page, fixture.account);
      await page
        .getByRole("button", { name: "Add a story", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Enable camera and microphone",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Check publication", exact: true }),
      ).toHaveCount(0);
      await expect(page.locator('video[src^="blob:"]')).toHaveCount(0);
      expect(
        await page.evaluate(() => sessionStorage.getItem("storyCameraCalls")),
      ).toBe("1");
    },
  });
});

test("unknown-close releases URLs and tracks; same owner reopens original bytes and retries only authoritative absence with the same operation", async ({
  page,
}) => {
  test.setTimeout(60000);
  await withResource({
    start: startStoryFixture,
    use: async (fixture) => {
      await observeCamera(page);
      await openRecorder({ page, account: fixture.account });
      await recordPreview(page);
      const original = await previewIdentity(page);
      const operations: string[] = [];
      await page.route("**/api/stories", async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        operations.push(route.request().headers()["idempotency-key"] ?? "");
        if (operations.length === 1) {
          await route.abort("failed");
          return;
        }
        await route.continue();
      });
      await page
        .getByRole("button", {
          name: "Publish",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("button", { name: "Check publication", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Leave and check later", exact: true })
        .click();
      await expect(page).toHaveURL("https://localhost/");
      expect(
        await page.evaluate(() => sessionStorage.getItem("storyActiveUrls")),
      ).toBe("0");
      expect(
        await page.evaluate(() => sessionStorage.getItem("storyTrackStops")),
      ).toBe("2");
      await page
        .getByRole("button", { name: "Add a story", exact: true })
        .click();
      const reopened = await previewIdentity(page);
      expect(reopened.url).not.toBe(original.url);
      expect(reopened.hash).toBe(original.hash);
      expect(
        await page.evaluate(() => sessionStorage.getItem("storyCameraCalls")),
      ).toBe("1");
      await expect(
        page.getByRole("button", {
          name: "Retry this publication",
          exact: true,
        }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Check publication", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Retry this publication", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText("Story published");
      expect(operations).toHaveLength(2);
      expect(operations[1]).toBe(operations[0]);
      expect(
        await page.evaluate(() => sessionStorage.getItem("storyActiveUrls")),
      ).toBe("0");
    },
  });
});
