import {
  createCompose,
  requireSuccess,
} from "../../../scripts/infra/commands/compose";
import { OwnedProcesses } from "../../../scripts/infra/commands/processes";
import { inspectProject } from "../../../scripts/infra/host/containers";
import { assertProjectOwnership } from "../../../scripts/infra/host/preflight";
import { readLifecycleConfig } from "../../../scripts/infra/verification/config";
import { loginUser } from "../../fixtures/auth05/ui";
import { waitUntil } from "../../fixtures/barrier";
import { test as base, expect } from "../../fixtures/browser-egress/test";
import { startChatFixture } from "../../fixtures/chat05/browser";
import { withResource } from "../../fixtures/lifecycle/with-resource";

const test = base.extend<{ ownedProcesses: OwnedProcesses }>({
  browserEgress: async (
    { ownedProcesses: _ownedProcesses, browserEgress },
    use,
  ) => {
    await use(browserEgress);
  },
  ownedProcesses: [
    async ({ browserName }, use) => {
      if (browserName !== "chromium")
        throw new Error("Docker lifecycle requires Chromium");
      readLifecycleConfig();
      const processes = new OwnedProcesses(new AbortController().signal);
      await withResource({
        start: async () => ({ dispose: () => processes.close() }),
        use: async () => {
          assertProjectOwnership(await inspectProject(processes));
          await use(processes);
        },
      });
    },
    { auto: true },
  ],
});

test("authenticated session and canonical message survive independent backend and frontend recreation", async ({
  page,
  context,
  ownedProcesses: processes,
}) => {
  test.setTimeout(180000);
  const compose = createCompose({ processes });
  await withResource({
    start: startChatFixture,
    use: async (fixture) => {
      await loginUser(page, fixture.alice);
      await page.goto("https://localhost/conversations");
      await page.getByRole("searchbox").fill(fixture.bob.username);
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await page
        .getByRole("button", { name: fixture.bob.username, exact: true })
        .click();
      await expect(page).toHaveURL(/\/conversations\/[a-f0-9]{24}$/);
      const url = page.url();
      const text = `Lifecycle ${crypto.randomUUID()}`;
      await page.getByTestId("message-composer").fill(text);
      await page.getByTestId("message-composer").press("Enter");
      await expect(
        page.getByTestId("message-list").getByText(text, { exact: true }),
      ).toHaveCount(1);
      const cookie = (await context.cookies()).find(
        (entry) => entry.name === "insta_session",
      );
      expect(cookie).toMatchObject({ httpOnly: true, secure: true });
      for (const [service, other] of [
        ["be-insta", "fe-insta"],
        ["fe-insta", "be-insta"],
      ] as const) {
        const otherId = await compose.capture(["ps", "-q", other]);
        const previousId = await compose.capture(["ps", "-q", service]);
        requireSuccess(
          await compose.run([
            "up",
            "-d",
            "--no-deps",
            "--no-build",
            "--pull",
            "never",
            "--force-recreate",
            service,
          ]),
        );
        await waitUntil({
          check: async () => {
            try {
              return (
                (await compose.capture([
                  "exec",
                  "-T",
                  "fe-insta",
                  "bun",
                  "-e",
                  'console.log((await fetch("http://localhost:3000/api/health/ready")).status)',
                ])) === "200"
              );
            } catch {
              return false;
            }
          },
        });
        expect(await compose.capture(["ps", "-q", other])).toBe(otherId);
        expect(await compose.capture(["ps", "-q", service])).not.toBe(
          previousId,
        );
        await page.goto(url);
        await expect(page.getByTestId("current-actor")).toHaveText(
          fixture.alice.username,
        );
        await expect(
          page.getByTestId("message-list").getByText(text, { exact: true }),
        ).toHaveCount(1);
        expect(
          (await context.cookies()).find(
            (entry) => entry.name === "insta_session",
          )?.value,
        ).toBe(cookie?.value);
      }
    },
  });
});
