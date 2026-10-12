import { z } from "zod";
import { startAuthFixture } from "../../fixtures/auth05/browser";
import { expect, test } from "../../fixtures/browser-egress/test";
import { withResource } from "../../fixtures/lifecycle/with-resource";
import { startStoryFixture } from "../../fixtures/stories/browser";
import { readRegistrationCode } from "../auth/lib/ui-recovery";
import { publishFixtureStories, rejectAutoplay } from "./lib/publication";

const watchEffects = async (page: import("@playwright/test").Page) => {
  const calls = { publish: 0 };
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/stories"
    )
      calls.publish++;
  });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      sessionStorage.setItem(
        "story-camera-calls",
        String(Number(sessionStorage.getItem("story-camera-calls") ?? 0) + 1),
      );
      throw new DOMException("Camera must remain unused", "NotAllowedError");
    };
  });
  return async () => {
    expect(
      await page.evaluate(() =>
        Number(sessionStorage.getItem("story-camera-calls") ?? 0),
      ),
    ).toBe(0);
    expect(calls.publish).toBe(0);
  };
};

test("guest story CTA retains selected intent through real modal login and opens one ready scenario with no camera or publication", async ({
  page,
}) => {
  await withResource({
    start: startAuthFixture,
    use: async (fixture) => {
      const assertNoEffects = await watchEffects(page);
      await page.goto("https://localhost/");
      await page
        .getByRole("button", { name: "Add a story", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Sign in", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("textbox", { name: "Email", exact: true })
        .fill(fixture.account.email);
      await page
        .getByLabel("Password", { exact: true })
        .fill(fixture.account.password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByTestId("current-actor")).toBeVisible();
      await page.getByRole("link", { name: "Continue", exact: true }).click();
      await expect(
        page.getByRole("dialog", { name: "New story", exact: true }),
      ).toHaveCount(1);
      await expect(page).toHaveURL(
        /\/stories\/new\?operationId=[a-f0-9-]+&mode=create_story$/,
      );
      await assertNoEffects();
    },
  });
});

test("guest story selection survives full real Mailpit registration; verified email alone cannot resume", async ({
  page,
}) => {
  test.setTimeout(60000);
  await withResource({
    start: startAuthFixture,
    use: async (fixture) => {
      const assertNoEffects = await watchEffects(page);
      await page.goto("https://localhost/");
      const created = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/auth/continuation") &&
          response.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "Add a story", exact: true })
        .click();
      const receipt = await (await created).json();
      await page
        .getByRole("dialog")
        .getByRole("link", { name: "Create account", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Email", exact: true })
        .fill(fixture.signupEmail);
      await page
        .getByRole("button", { name: "Send code", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Verification code", exact: true })
        .fill(
          await readRegistrationCode({
            email: fixture.signupEmail,
            hostMailpitUrl: fixture.hostMailpitUrl,
          }),
        );
      await page
        .getByRole("button", { name: "Verify email", exact: true })
        .click();
      await expect(
        page.getByRole("textbox", { name: "Username", exact: true }),
      ).toBeVisible();
      expect(
        (
          await page.request.post(
            `https://localhost/api/auth/continuation/${receipt.data.intentId}/resume`,
            { headers: { origin: "https://localhost" } },
          )
        ).status(),
      ).toBe(409);
      await expect(
        page.getByRole("dialog", { name: "New story", exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("textbox", { name: "Username", exact: true })
        .fill(`S${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`);
      await page
        .getByLabel("Password", { exact: true })
        .fill("synthetic-story-password-123");
      await page
        .getByRole("button", { name: "Finish registration", exact: true })
        .click();
      await expect(page.getByTestId("current-actor")).toBeVisible();
      await page.getByRole("link", { name: "Continue", exact: true }).click();
      await expect(
        page.getByRole("dialog", { name: "New story", exact: true }),
      ).toHaveCount(1);
      await assertNoEffects();
    },
  });
});

test("native story CTA and no-JS login reach the story ready fallback", async ({
  browser,
  proxy,
}) => {
  await withResource({
    start: startAuthFixture,
    use: async (fixture) => {
      const context = await browser.newContext({
        proxy,
        ignoreHTTPSErrors: true,
        javaScriptEnabled: false,
      });
      try {
        const page = await context.newPage();
        await page.goto("https://localhost/");
        await page
          .getByRole("button", { name: "Add a story", exact: true })
          .click();
        const cookieNotice = page.getByRole("complementary", {
          name: "Cookies and optional analytics",
          exact: true,
        });
        await expect(cookieNotice).toBeVisible();
        await expect(
          cookieNotice.getByRole("button", {
            name: "Necessary cookies only",
            exact: true,
          }),
        ).toBeVisible();
        expect(
          await cookieNotice.evaluate(
            (node) => getComputedStyle(node).position,
          ),
        ).toBe("static");
        await expect(page).toHaveURL(/\?mode=login&intentId=/);
        await page
          .getByRole("textbox", { name: "Email", exact: true })
          .fill(fixture.account.email);
        await page
          .getByLabel("Password", { exact: true })
          .fill(fixture.account.password);
        await page
          .getByRole("button", { name: "Sign in", exact: true })
          .click();
        await expect(page.getByTestId("current-actor")).toBeVisible();
        await page.getByRole("link", { name: "Continue", exact: true }).click();
        await page
          .getByRole("button", { name: "Continue", exact: true })
          .click();
        await expect(page.getByTestId("story-ready")).toBeVisible();
        await expect(page.getByTestId("story-ready")).toContainText(
          "Recording requires JavaScript",
        );
        await page
          .getByRole("button", { name: "Add a story", exact: true })
          .click();
        await expect(page.getByTestId("story-ready")).toBeVisible();
      } finally {
        await context.close();
      }
    },
  });
});

test("reused continuation page resumes the new Story selection and ignores the previous selection's late rejection", async ({
  page,
}) => {
  await withResource({
    start: startAuthFixture,
    use: async (fixture) => {
      const assertNoEffects = await watchEffects(page);
      expect(
        (
          await page.request.post("https://localhost/api/auth/login", {
            headers: { origin: "https://localhost" },
            data: fixture.account,
          })
        ).status(),
      ).toBe(200);
      await page.goto(
        `https://localhost/continue?intentId=${crypto.randomUUID()}`,
      );
      await expect(page.getByRole("status")).toHaveText(
        "This action is no longer available.",
      );
      await page
        .getByRole("button", { name: "Add a story", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "New story", exact: true }),
      ).toHaveCount(1);

      const previousId = crypto.randomUUID();
      const previousReached = Promise.withResolvers<void>();
      const releasePrevious = Promise.withResolvers<void>();
      const currentReached = Promise.withResolvers<void>();
      const releaseCurrent = Promise.withResolvers<void>();
      const previousFinished = Promise.withResolvers<void>();
      const routePattern = "**/api/auth/continuation/*/resume";
      await page.route(routePattern, async (route) => {
        const response = await route.fetch();
        const previous = route.request().url().includes(previousId);
        if (previous) {
          previousReached.resolve();
          await releasePrevious.promise;
        } else {
          currentReached.resolve();
          await releaseCurrent.promise;
        }
        await route.fulfill({ response });
        if (previous) previousFinished.resolve();
      });
      try {
        await page.goto(`https://localhost/continue?intentId=${previousId}`);
        await previousReached.promise;
        await page
          .getByRole("button", { name: "Add a story", exact: true })
          .click();
        await currentReached.promise;
        releasePrevious.resolve();
        await previousFinished.promise;
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              );
            }),
        );
        await expect(page.getByRole("status")).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "Continue", exact: true }),
        ).toBeVisible();
        releaseCurrent.resolve();
        await expect(
          page.getByRole("dialog", { name: "New story", exact: true }),
        ).toHaveCount(1);
        await assertNoEffects();
      } finally {
        releasePrevious.resolve();
        releaseCurrent.resolve();
        await page.unrouteAll({ behavior: "wait" });
      }
    },
  });
});

for (const identity of ["guest", "authenticated"] as const) {
  test(
    identity +
      " closing Story during real contact creation cancels its late receipt without navigation or sign-in",
    async ({ page }) => {
      test.setTimeout(60000);
      await withResource({
        start: startStoryFixture,
        use: async (fixture) => {
          await withResource({
            start: startAuthFixture,
            use: async (viewer) => {
              const { author } = await publishFixtureStories({
                page,
                account: fixture.account,
                count: 1,
              });
              if (identity === "authenticated")
                expect(
                  (
                    await page.request.post(
                      "https://localhost/api/auth/login",
                      {
                        headers: { origin: "https://localhost" },
                        data: viewer.account,
                      },
                    )
                  ).status(),
                ).toBe(200);
              await rejectAutoplay(page);
              await page.goto("https://localhost/");
              const initialUrl = page.url();
              const reached = Promise.withResolvers<string>();
              const release = Promise.withResolvers<void>();
              const resumeRequests: string[] = [];
              page.on("request", (request) => {
                if (new URL(request.url()).pathname.endsWith("/resume"))
                  resumeRequests.push(request.url());
              });
              await page.route("**/api/auth/continuation", async (route) => {
                const response = await route.fetch();
                const receipt = z
                  .object({
                    ok: z.literal(true),
                    data: z.object({ intentId: z.string() }),
                  })
                  .parse(await response.json());
                reached.resolve(receipt.data.intentId);
                await release.promise;
                await route.fulfill({ response });
              });
              try {
                await page
                  .getByRole("button", {
                    name: `Watch stories by ${author.username}`,
                    exact: true,
                  })
                  .click();
                const player = page.getByRole("dialog", {
                  name: author.username,
                  exact: true,
                });
                await player
                  .getByRole("button", { name: "Write to author", exact: true })
                  .click();
                const intentId = await reached.promise;
                await player
                  .getByRole("button", { name: "Close", exact: true })
                  .click();
                await expect(player).toHaveCount(0);
                const cancelled = page.waitForResponse(
                  (response) =>
                    response.request().method() === "DELETE" &&
                    new URL(response.url()).pathname ===
                      `/api/auth/continuation/${intentId}`,
                );
                release.resolve();
                expect((await cancelled).status()).toBe(200);
                await expect(page).toHaveURL(initialUrl);
                await expect(
                  page.getByRole("dialog", { name: "Sign in", exact: true }),
                ).toHaveCount(0);
                await expect(
                  page.getByRole("link", { name: "Continue", exact: true }),
                ).toHaveCount(0);
                expect(resumeRequests).toEqual([]);
              } finally {
                release.resolve();
                await page.unrouteAll({ behavior: "wait" });
              }
            },
          });
        },
      });
    },
  );
}
