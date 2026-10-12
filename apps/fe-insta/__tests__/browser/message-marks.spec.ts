import { expect, test } from "@playwright/test";

test.beforeAll(({ browser }, testInfo) => {
  console.info(
    `Renderer channel ${testInfo.project.name}: ${browser.version()}`,
  );
});
test("normal outgoing marks have localized accessible labels without interactions", async ({
  page,
}) => {
  await page.goto("/");
  for (const [locale, labels] of [
    ["ru", ["Отправлено", "Доставлено", "Прочитано"]],
    ["en", ["Sent", "Delivered", "Read"]],
  ] as const) {
    if (locale === "en")
      await page.getByRole("button", { name: "English" }).click();
    for (const [index, id] of ["sent", "delivered", "read"].entries()) {
      const row = page.locator(`[data-message-id="${id}"]`);
      const mark = row.getByRole("img", { name: labels[index], exact: true });
      await expect(mark).toBeVisible();
      await expect(row.getByRole("button")).toHaveCount(0);
      await expect(mark).not.toHaveAttribute("tabindex");
      await mark.hover();
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      expect(
        await mark.evaluate((element) => {
          if (element instanceof HTMLElement) element.focus();
          return document.activeElement === element;
        }),
      ).toBe(false);
    }
  }
});
test("hidden or unfocused viewport stays unread; return rechecks oversized partial row and cleanup", async ({
  page,
}) => {
  await page.addInitScript(() => {
    document.hasFocus = () =>
      document.documentElement.dataset.focused === "true";
    Object.defineProperty(document, "visibilityState", {
      get: () =>
        document.documentElement.dataset.hidden === "true"
          ? "hidden"
          : "visible",
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Oversized" }).click();
  await page.locator('[data-testid="message-list"]').evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(page.getByTestId("reads")).toHaveText("");
  await page.evaluate(() => {
    document.documentElement.dataset.focused = "true";
    document.documentElement.dataset.hidden = "true";
    window.dispatchEvent(new Event("focus"));
  });
  await expect(page.getByTestId("reads")).toHaveText("");
  await page.evaluate(() => {
    document.documentElement.dataset.hidden = "false";
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByTestId("reads")).toHaveText("m1");
  await page.getByRole("button", { name: "Unmount" }).click();
  const reads = await page.getByTestId("reads").textContent();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect(await page.getByTestId("reads").textContent()).toBe(reads);
  await expect(page.getByTestId("message-list")).toHaveCount(0);
});
test("explicit list inside off-window host or clipped ancestor does not acknowledge unseen rows", async ({
  page,
}) => {
  await page.addInitScript(() => {
    document.hasFocus = () =>
      document.documentElement.dataset.focused === "true";
  });
  await page.goto("/");
  await page.getByTestId("fixture-host").evaluate((element) => {
    element.style.transform = "translateY(2000px)";
  });
  await page.evaluate(() => {
    document.documentElement.dataset.focused = "true";
    window.dispatchEvent(new Event("focus"));
  });
  await expect(page.getByTestId("reads")).toHaveText("");
  await page.getByTestId("fixture-host").evaluate((element) => {
    element.style.transform = "";
    element.style.height = "0";
    element.style.overflow = "hidden";
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByTestId("reads")).toHaveText("");
  await page.getByTestId("fixture-host").evaluate((element) => {
    element.style.height = "";
    element.style.overflow = "";
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByTestId("reads")).not.toHaveText("");
});
test("zero-area edge intersection does not read the incoming row", async ({
  page,
}) => {
  await page.addInitScript(() => {
    document.hasFocus = () =>
      document.documentElement.dataset.focused === "true";
  });
  await page.goto("/");
  await page.getByTestId("message-list").evaluate((root) => {
    const row = root.querySelector('[data-message-id="m1"]');
    if (!row) throw new Error("row missing");
    root.scrollTop +=
      row.getBoundingClientRect().bottom - root.getBoundingClientRect().top;
  });
  await page.evaluate(() => {
    document.documentElement.dataset.focused = "true";
    window.dispatchEvent(new Event("focus"));
  });
  await expect(page.getByTestId("reads")).not.toHaveText("");
  expect(
    (await page.getByTestId("reads").textContent())?.split(","),
  ).not.toContain("m1");
});
test("edge row becomes read after two pixels enter without focus or items changing", async ({
  page,
}) => {
  await page.addInitScript(() => {
    document.hasFocus = () =>
      document.documentElement.dataset.focused === "true";
    const NativeObserver = window.IntersectionObserver;
    window.IntersectionObserver = class extends NativeObserver {
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        super((entries, observer) => {
          callback(entries, observer);
          for (const entry of entries) {
            if (
              entry.target.getAttribute("data-message-id") === "m1" &&
              entry.isIntersecting &&
              entry.intersectionRect.height === 0
            )
              document.documentElement.dataset.edgeConsumed = "true";
          }
        }, options);
        document.documentElement.dataset.observers = String(
          Number(document.documentElement.dataset.observers ?? "0") + 1,
        );
      }
    };
  });
  await page.goto("/");
  await page.getByTestId("message-list").evaluate((root) => {
    const row = root.querySelector('[data-message-id="m1"]');
    if (!row) throw new Error("row missing");
    root.scrollTop +=
      row.getBoundingClientRect().bottom - root.getBoundingClientRect().top;
  });
  expect(
    await page.getByTestId("message-list").evaluate((root) => {
      const row = root.querySelector('[data-message-id="m1"]');
      if (!row) throw new Error("row missing");
      return (
        row.getBoundingClientRect().bottom - root.getBoundingClientRect().top
      );
    }),
  ).toBe(0);
  await page.evaluate(() => {
    document.documentElement.dataset.focused = "true";
    window.dispatchEvent(new Event("focus"));
  });
  await expect(page.locator("html")).toHaveAttribute(
    "data-edge-consumed",
    "true",
  );
  expect(
    (await page.getByTestId("reads").textContent())?.split(","),
  ).not.toContain("m1");
  const observers = await page.locator("html").getAttribute("data-observers");
  await page.getByTestId("message-list").evaluate((root) => {
    root.scrollTop -= 2;
  });
  await expect
    .poll(async () =>
      (await page.getByTestId("reads").textContent())?.split(","),
    )
    .toContain("m1");
  expect(await page.locator("html").getAttribute("data-observers")).toBe(
    observers,
  );
});
test("owned scroll reevaluation stops observing after unmount", async ({
  page,
}) => {
  await page.addInitScript(() => {
    document.hasFocus = () => true;
    const NativeObserver = window.IntersectionObserver;
    window.IntersectionObserver = class extends NativeObserver {
      observe(target: Element) {
        super.observe(target);
        document.documentElement.dataset.observationAttempts = String(
          Number(document.documentElement.dataset.observationAttempts ?? "0") +
            1,
        );
      }
    };
  });
  await page.goto("/");
  await expect(page.getByTestId("reads")).not.toHaveText("");
  const initial = Number(
    await page.locator("html").getAttribute("data-observation-attempts"),
  );
  await page.evaluate(() => document.dispatchEvent(new Event("scroll")));
  await expect
    .poll(async () =>
      Number(
        await page.locator("html").getAttribute("data-observation-attempts"),
      ),
    )
    .toBeGreaterThan(initial);
  await page.getByRole("button", { name: "Unmount" }).click();
  const settled = await page
    .locator("html")
    .getAttribute("data-observation-attempts");
  await page.evaluate(() => document.dispatchEvent(new Event("scroll")));
  expect(
    await page.locator("html").getAttribute("data-observation-attempts"),
  ).toBe(settled);
});
test("terminal mark exposes one SVG, visible focus/touch details and a 44px target", async ({
  page,
}) => {
  await page.goto("/");
  await page.setViewportSize({ width: 320, height: 900 });
  const mark = page.locator('[data-message-mark="error"]');
  await expect(mark.locator("svg")).toHaveCount(1);
  const box = await mark.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await mark.focus();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toContainText("MESSAGE_REJECTED");
  const surface = await tooltip.evaluate((element) => {
    const panel = document.createElement("span");
    panel.style.backgroundColor = "var(--ui-surface-panel)";
    document.body.append(panel);
    const panelColor = getComputedStyle(panel).backgroundColor;
    panel.remove();
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      color: style.color,
      opacity: style.opacity,
      panelColor,
    };
  });
  expect(surface.background).toBe(surface.panelColor);
  expect(surface.background).toBe("rgb(255, 255, 255)");
  expect(surface.opacity).toBe("1");
  expect(surface.color).toBe("rgb(36, 31, 27)");
  const [tooltipBox, statusBox, pendingBox] = await Promise.all([
    tooltip.boundingBox(),
    page.getByTestId("pending-status").boundingBox(),
    page.getByTestId("pending-message").boundingBox(),
  ]);
  if (!tooltipBox || !statusBox || !pendingBox)
    throw new Error("Expected pending message tooltip geometry");
  expect(tooltipBox.x).toBeLessThan(statusBox.x + statusBox.width);
  expect(tooltipBox.x + tooltipBox.width).toBeGreaterThan(statusBox.x);
  expect(tooltipBox.y).toBeLessThan(statusBox.y + statusBox.height);
  expect(tooltipBox.y + tooltipBox.height).toBeGreaterThan(statusBox.y);
  expect(tooltipBox.x).toBeGreaterThanOrEqual(pendingBox.x);
  expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(
    pendingBox.x + pendingBox.width,
  );
  await page.locator("h1").click();
  await mark.click();
  await expect(page.getByRole("tooltip")).toContainText("MESSAGE_REJECTED");
  await mark.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});
for (const width of [320, 390, 768, 1440]) {
  for (const id of ["sent", "read"]) {
    test(`metadata keeps one mark right of time below ${id} message at ${width}px in RU/EN`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      for (const locale of ["ru", "en"]) {
        if (locale === "en")
          await page.getByRole("button", { name: "English" }).click();
        const row = page.locator(`[data-message-id="${id}"]`);
        const time = row.locator("time");
        const mark = row.locator("[data-message-mark]");
        await expect(mark).toHaveCount(1);
        await expect(mark.locator("svg")).toHaveCount(1);
        await expect(time).toHaveText(/^\d{2}:\d{2}$/);
        const [rowBox, timeBox, markBox] = await Promise.all([
          row.boundingBox(),
          time.boundingBox(),
          mark.boundingBox(),
        ]);
        if (!rowBox || !timeBox || !markBox)
          throw new Error("Expected rendered metadata");
        expect(markBox.x).toBeGreaterThanOrEqual(timeBox.x + timeBox.width);
        expect(markBox.x - timeBox.x - timeBox.width).toBeLessThanOrEqual(4);
        expect(
          Math.abs(
            timeBox.y + timeBox.height / 2 - markBox.y - markBox.height / 2,
          ),
        ).toBeLessThan(1);
        expect(markBox.x + markBox.width).toBeLessThanOrEqual(
          rowBox.x + rowBox.width,
        );
        const inset = await row.evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).paddingRight),
        );
        expect(
          Math.abs(rowBox.x + rowBox.width - markBox.x - markBox.width - inset),
        ).toBeLessThan(1);
        const textBox = await row.locator("span").first().boundingBox();
        if (!textBox) throw new Error("Expected rendered message text");
        expect(Math.min(timeBox.y, markBox.y)).toBeGreaterThanOrEqual(
          textBox.y + textBox.height,
        );
        await expect(
          page
            .locator('[data-message-id="m39"]')
            .locator("[data-message-mark]"),
        ).toHaveCount(0);
        await expect(row).toHaveAttribute("data-author-id", "alice");
      }
    });
  }
}
