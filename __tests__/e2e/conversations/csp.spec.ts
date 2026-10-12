import { expect, test } from "../../fixtures/browser-egress/test";
import type {} from "../../fixtures/realtime/browser";
import { startCspFixture } from "../../fixtures/realtime/csp-server";
import { installRealtimeProbe } from "../../fixtures/realtime/install-browser";

test("strict CSP permits ticket, error, ACK and pushed event validation without eval", async ({
  page,
}) => {
  const fixture = await startCspFixture();
  try {
    await page.goto(fixture.url);
    await expect(page.locator("html")).toHaveAttribute(
      "data-eval-blocked",
      "true",
    );
    await installRealtimeProbe(page);
    await page.evaluate(
      (id) => window.__realtimeProbe.connect(id),
      fixture.conversationId,
    );
    await expect
      .poll(() =>
        page.evaluate(() => window.__realtimeProbe.snapshot().unauthorized),
      )
      .toBe(1);
    await page.evaluate(
      (id) => window.__realtimeProbe.connect(id),
      fixture.conversationId,
    );
    await expect
      .poll(() =>
        page.evaluate(() => window.__realtimeProbe.snapshot().subscribed),
      )
      .toBe(1);
    await expect
      .poll(() =>
        page.evaluate(() => window.__realtimeProbe.snapshot().invalidations),
      )
      .toBe(1);
    await expect.poll(fixture.deliveryApplied).toBe(true);
    expect(
      await page.evaluate(
        () => window.__realtimeProbe.snapshot().ticketRequests,
      ),
    ).toBe(2);
    expect(
      await page.evaluate(() => window.__realtimeProbe.snapshot().observations),
    ).not.toContain("invalid");
  } finally {
    await page.evaluate(() => window.__realtimeProbe?.dispose());
    await fixture.dispose();
  }
});
