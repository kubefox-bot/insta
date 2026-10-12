import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { withResource } from "../../../fixtures/lifecycle/with-resource";
import { startStoryFixture } from "../../../fixtures/stories/browser";
import { rendererPolicy } from "./conts";
export const withContactRenderer = async (
  page: Page,
  use: () => Promise<void>,
) =>
  withResource({
    start: startStoryFixture,
    use: async (fixture) => {
      await page.addInitScript(() => {
        HTMLMediaElement.prototype.play = () =>
          Promise.reject(
            new DOMException(
              "Controlled autoplay rejection",
              "NotAllowedError",
            ),
          );
      });
      const pattern = `https://localhost${rendererPolicy.base}**`;
      await page.route(pattern, async (route) => {
        const response = await fetch(
          `${fixture.url}${new URL(route.request().url()).pathname}`,
        );
        await route.fulfill({
          status: response.status,
          contentType:
            response.headers.get("content-type") ?? "application/octet-stream",
          body: Buffer.from(await response.arrayBuffer()),
        });
      });
      try {
        await page.goto(`https://localhost${rendererPolicy.base}index.html`);
        await expect(
          page.getByRole("heading", {
            name: "Story contact renderer",
            exact: true,
          }),
        ).toBeVisible();
        await use();
      } finally {
        await page.unroute(pattern);
      }
    },
  });
export const settleRendererContact = async (page: Page, command: string) => {
  await page.getByTestId(command).evaluate((node) => {
    if (!(node instanceof HTMLButtonElement))
      throw new Error("Fixture control absent");
    node.click();
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
};
