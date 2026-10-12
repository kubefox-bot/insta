import { expect, test } from "@playwright/test";

test("SSR hydrates in browser timezone, refreshes at midnight and releases its clock", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.text().includes("hydration")) errors.push(message.text());
  });
  const html = await (await request.get("/")).text();
  expect(html).toContain("Bob");
  expect(html).toContain("--:--");
  expect(html).not.toContain(">10:30<");
  await page.clock.install({ time: new Date("2026-10-11T19:59:30Z") });
  await page.addInitScript(() => {
    const original = Intl.DateTimeFormat.prototype.resolvedOptions;
    Intl.DateTimeFormat.prototype.resolvedOptions = function () {
      const element = document.documentElement;
      if (element)
        element.dataset.zoneReads = String(
          Number(element.dataset.zoneReads ?? "0") + 1,
        );
      return original.call(this);
    };
  });
  await page.goto("/");
  const activity = page.locator("nav time");
  await expect(activity).toHaveText("сегодня, 14:30");
  await expect(activity).toHaveAttribute(
    "datetime",
    "2026-10-11T10:30:00.000Z",
  );
  await page.clock.runFor(30000);
  await expect(activity).toHaveText("вчера, 14:30");
  await page.getByRole("button", { name: "English" }).click();
  await expect(activity).toHaveText("yesterday, 14:30");
  await page.getByRole("button", { name: "New activity" }).click();
  await expect(activity).toHaveText("today, 00:00");
  await page.clock.setSystemTime(new Date("2026-10-12T20:01:00Z"));
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(activity).toHaveText("yesterday, 00:00");
  await page.getByRole("button", { name: "Unmount" }).click();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  const reads = await page.locator("html").getAttribute("data-zone-reads");
  await page.clock.runFor(120000);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  expect(await page.locator("html").getAttribute("data-zone-reads")).toBe(
    reads,
  );
  expect(errors).toEqual([]);
});

test("UTC SSR metadata uses placeholder then browser Tbilisi time with stable narrow mark geometry in RU and EN", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const html = await (await request.get("/")).text();
  expect(html).toContain("--:--");
  expect(html).not.toContain(">10:30<");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const metadata = page.getByTestId("metadata");
  await expect(metadata.locator("time")).toHaveText("14:30");
  await expect(metadata.locator("time")).toHaveAttribute(
    "datetime",
    "2026-10-11T10:30:00.000Z",
  );
  const mark = await metadata.locator("[data-message-mark]").boundingBox();
  const time = await metadata.locator("time").boundingBox();
  expect(mark).not.toBeNull();
  expect(time).not.toBeNull();
  if (!mark || !time) throw new Error("Missing metadata geometry");
  expect(mark.x).toBeGreaterThanOrEqual(time.x + time.width - 1);
  expect(
    Math.abs(mark.y + mark.height / 2 - time.y - time.height / 2),
  ).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "English" }).click();
  await expect(metadata.locator("time")).toHaveText("14:30");
  await expect(metadata.locator("[data-message-mark]")).toHaveAttribute(
    "aria-label",
    "Sent",
  );
  expect(errors).toEqual([]);
  const placeholderMark = await metadata.evaluate((element) => {
    const time = element.querySelector("time");
    const mark = element.querySelector("[data-message-mark]");
    if (!time || !mark) throw new Error("Missing metadata geometry");
    const original = time.textContent;
    try {
      time.textContent = "--:--";
      const box = mark.getBoundingClientRect();
      return { x: box.x, y: box.y };
    } finally {
      time.textContent = original;
    }
  });
  expect(Math.abs(mark.x - placeholderMark.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(mark.y - placeholderMark.y)).toBeLessThanOrEqual(1);
});
