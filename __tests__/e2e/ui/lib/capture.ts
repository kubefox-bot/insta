import { chmod } from "node:fs/promises";
import { mediaQueries } from "@insta/fe-core/ui/breakpoints";
import { expect, type Page } from "@playwright/test";
import { repaintTimeoutMs, screenshotTimeoutMs } from "./conts";
import type { CaptureInput, CaptureMode } from "./types";

const hydratedReady = async (page: Page) => {
  const expired = Promise.withResolvers<void>();
  const timeout = setTimeout(
    () => expired.reject(new Error("Repaint frame deadline exceeded")),
    repaintTimeoutMs,
  );
  try {
    await Promise.race([
      page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      ),
      expired.promise,
    ]);
  } finally {
    clearTimeout(timeout);
  }
};
const nativeReady = async (page: Page) => {
  await expect
    .poll(() => page.evaluate(() => document.readyState))
    .toBe("complete");
};
const readiness = {
  native: nativeReady,
  hydrated: hydratedReady,
} satisfies Record<CaptureMode, (page: Page) => Promise<void>>;

export const captureViewport = async ({
  page,
  info,
  name,
  mode = "hydrated",
}: CaptureInput) => {
  await readiness[mode](page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const compactDetail =
    /^\/conversations\/[a-f0-9]{24}\/?$/.test(new URL(page.url()).pathname) &&
    (await page.evaluate(
      (query) => matchMedia(query).matches,
      mediaQueries.compact,
    ));
  if (compactDetail) {
    await expect(page.getByTestId("conversation-header")).toBeVisible();
    await expect(page.getByRole("banner")).toBeHidden();
  } else await expect(page.getByRole("banner")).toBeVisible();
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({
    path,
    fullPage: false,
    timeout: screenshotTimeoutMs,
  });
  await chmod(path, 0o600);
  console.log(
    JSON.stringify({
      visual: name,
      path,
      mode,
      geometry: await page.evaluate(() => {
        const primary = [...document.querySelectorAll("a,button")].find(
          (element) =>
            getComputedStyle(element).backgroundColor.startsWith("rgb("),
        );
        const alert = document.querySelector('[role="alert"]');
        return {
          width: innerWidth,
          height: innerHeight,
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          fontFamily: getComputedStyle(document.body).fontFamily,
          reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
          primaryColors: primary
            ? {
                text: getComputedStyle(primary).color,
                background: getComputedStyle(primary).backgroundColor,
              }
            : null,
          alertColor: alert ? getComputedStyle(alert).color : null,
        };
      }),
    }),
  );
};
export const captureMatrix = async (input: CaptureInput) => {
  for (const width of [1440, 768, 320]) {
    await input.page.setViewportSize({ width, height: 900 });
    await captureViewport({ ...input, name: `${input.name}-${width}` });
  }
};
