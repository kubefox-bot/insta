import type { Page } from "@playwright/test";
import { expect } from "./test";

export const expectConversationColumns = async ({
  page,
  width,
}: Readonly<{ page: Page; width: number }>) => {
  if (width < 768) {
    await expect(page.getByTestId("conversation-sidebar")).toBeHidden();
    await expect(page.getByRole("banner")).toBeHidden();
    const composer = await page.getByTestId("message-composer").boundingBox();
    const viewport = page.viewportSize();
    if (!composer || !viewport)
      throw new Error("Expected compact composer in a viewport");
    expect(composer.y + composer.height).toBeLessThanOrEqual(viewport.height);
    return;
  }
  const panel = await page.getByTestId("conversation-panel").boundingBox();
  const sidebar = await page.getByTestId("conversation-sidebar").boundingBox();
  if (!panel || !sidebar) throw new Error("Expected actual desktop columns");
  expect(panel.x + panel.width).toBeLessThanOrEqual(sidebar.x);
};
