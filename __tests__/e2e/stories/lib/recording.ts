import type { Page } from "@playwright/test";
import { expect } from "../../../fixtures/browser-egress/test";
export const openRecorder = async ({
  page,
  account,
}: Readonly<{
  page: Page;
  account: Readonly<{ email: string; password: string }>;
}>) => {
  expect(
    (
      await page.request.post("https://localhost/api/auth/login", {
        headers: { origin: "https://localhost" },
        data: account,
      })
    ).status(),
  ).toBe(200);
  await page.goto("https://localhost/");
  const consent = page.getByRole("button", {
    name: "Necessary cookies only",
    exact: true,
  });
  if (await consent.isVisible()) await consent.click();
  await page.getByRole("button", { name: "Add a story", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "New story", exact: true }),
  ).toBeVisible();
};
export const recordPreview = async (page: Page) => {
  await page
    .getByRole("button", { name: "Enable camera and microphone", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("00:01 / 00:15", {
    timeout: 5000,
  });
  await page
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Publish",
      exact: true,
    }),
  ).toBeVisible();
};
export const observeCamera = async (page: Page) =>
  page.addInitScript(() => {
    const urls = new Set<string>();
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    sessionStorage.setItem("storyActiveUrls", "0");
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      urls.add(url);
      if (blob instanceof Blob) {
        blob
          .arrayBuffer()
          .then((bytes) => crypto.subtle.digest("SHA-256", bytes))
          .then((digest) => {
            const hash = Array.from(new Uint8Array(digest), (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join("");
            sessionStorage.setItem(url, hash);
          });
      }
      sessionStorage.setItem("storyActiveUrls", String(urls.size));
      return url;
    };
    URL.revokeObjectURL = (url) => {
      urls.delete(url);
      sessionStorage.setItem("storyActiveUrls", String(urls.size));
      revoke(url);
    };
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      sessionStorage.setItem(
        "storyCameraCalls",
        String(Number(sessionStorage.getItem("storyCameraCalls") ?? 0) + 1),
      );
      return original(constraints);
    };
    const stop = MediaStreamTrack.prototype.stop;
    MediaStreamTrack.prototype.stop = function () {
      sessionStorage.setItem(
        "storyTrackStops",
        String(Number(sessionStorage.getItem("storyTrackStops") ?? 0) + 1),
      );
      return stop.call(this);
    };
  });

export const previewIdentity = async (page: Page) => {
  const url = await page.locator('video[src^="blob:"]').getAttribute("src");
  if (!url) throw new Error("Missing preview URL");
  await expect
    .poll(() => page.evaluate((key) => sessionStorage.getItem(key), url))
    .toMatch(/^[a-f0-9]{64}$/);
  return {
    url,
    hash: await page.evaluate((key) => sessionStorage.getItem(key), url),
  };
};
