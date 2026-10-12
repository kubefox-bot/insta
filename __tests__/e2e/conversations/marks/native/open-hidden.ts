import { expect, type Page } from "@playwright/test";
import { browserState } from "../evidence";

export const openHidden = async ({
  page,
  parking,
  url,
}: Readonly<{ page: Page; parking: Page; url: string }>) => {
  await parking.bringToFront();
  await expect
    .poll(() => browserState(page))
    .toEqual({
      visibility: "hidden",
      focused: false,
    });
  const reached = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  await page.route(url, async (route) => {
    reached.resolve();
    await release.promise;
    // Continue in Chrome's owned proxy; APIRequest/route.fetch has no CDP proxy.
    await route.continue();
  });
  const navigation = page.goto(url);
  try {
    await reached.promise;
    await parking.bringToFront();
    await expect
      .poll(() => browserState(parking))
      .toEqual({
        visibility: "visible",
        focused: true,
      });
  } finally {
    release.resolve();
    await navigation;
    await page.unroute(url);
  }
  await expect
    .poll(() => browserState(page))
    .toEqual({
      visibility: "hidden",
      focused: false,
    });
};
