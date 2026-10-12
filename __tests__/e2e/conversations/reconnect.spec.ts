import { expect, test } from "../../fixtures/browser-egress/test";
import type {} from "../../fixtures/realtime/browser";
import { installRealtimeProbe } from "../../fixtures/realtime/install-browser";
import { startRealtimeFixture } from "../../fixtures/realtime/start-browser";

test("E09 WebSocket-only delivery reconnects with new tickets and replays the retained logical cursor", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  const fixture = await startRealtimeFixture();
  const urls: string[] = [];
  page.on("websocket", (socket) => urls.push(socket.url()));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/event"))
      urls.push(request.url());
  });
  try {
    await page.goto("https://localhost/?mode=login");
    const guest = await page.request.post(
      "https://localhost/api/realtime/ticket",
      { headers: { origin: "https://localhost" } },
    );
    expect(guest.status()).toBe(401);
    const denied = await page.request.post(
      "https://localhost/api/realtime/ticket",
      { headers: { origin: "https://foreign.test" } },
    );
    expect(denied.status()).toBe(403);
    const login = await page.request.post("https://localhost/api/auth/login", {
      headers: { origin: "https://localhost" },
      data: fixture.account,
    });
    expect(login.status()).toBe(200);
    await installRealtimeProbe(page);
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
        page.evaluate(() => window.__realtimeProbe.snapshot().transport),
      )
      .toBe("websocket");
    expect(urls.some((url) => url.includes("transport=polling"))).toBe(false);
    expect(urls.some((url) => url.includes("transport=websocket"))).toBe(true);
    expect(
      urls.every(
        (url) => !url.includes("ticket") && !url.includes("accessToken"),
      ),
    ).toBe(true);
    const sent = await fetch(`${fixture.url}/send`, { method: "POST" });
    expect(sent.status).toBe(200);
    await sent.body?.cancel();
    await expect
      .poll(() =>
        page.evaluate(() => window.__realtimeProbe.snapshot().eventIds.length),
      )
      .toBe(1);
    await context.setOffline(true);
    await page.evaluate(() => window.__realtimeProbe.cutTransport());
    await expect
      .poll(() =>
        page.evaluate(() => window.__realtimeProbe.snapshot().generationLosses),
      )
      .toBeGreaterThan(1);
    const missed = await fetch(`${fixture.url}/send`, { method: "POST" });
    expect(missed.status).toBe(200);
    await missed.body?.cancel();
    await context.setOffline(false);
    await expect
      .poll(
        () => page.evaluate(() => window.__realtimeProbe.snapshot().subscribed),
        { timeout: 15000 },
      )
      .toBe(2);
    expect(
      await page.evaluate(
        () => window.__realtimeProbe.snapshot().ticketRequests,
      ),
    ).toBeGreaterThanOrEqual(2);
    expect(
      await page.evaluate(() => window.__realtimeProbe.snapshot().unauthorized),
    ).toBe(0);
    await expect
      .poll(() =>
        page.evaluate(() => window.__realtimeProbe.snapshot().eventIds.length),
      )
      .toBe(2);
    const history = await (await fetch(`${fixture.url}/history`)).json();
    expect(history.data.items).toHaveLength(2);
    expect(
      history.data.items.map(
        (message: { sequence: number }) => message.sequence,
      ),
    ).toEqual([1, 2]);
    expect(
      await page.evaluate(() => window.__realtimeProbe.invalidation()),
    ).toBe("applied");
    expect(
      await page.evaluate(
        () => window.__realtimeProbe.snapshot().invalidations,
      ),
    ).toBe(1);
    const eventual = await page.request.get(
      "https://localhost/eventual?EIO=4&transport=polling",
    );
    expect(eventual.status()).toBe(404);
    expect(await eventual.text()).not.toContain('"sid"');
    await page.evaluate(() => window.__realtimeProbe.dispose());
    const before = await page.evaluate(
      () => window.__realtimeProbe.snapshot().eventIds.length,
    );
    const afterDispose = await fetch(`${fixture.url}/send`, { method: "POST" });
    expect(afterDispose.status).toBe(200);
    await afterDispose.body?.cancel();
    expect(
      await page.evaluate(
        () => window.__realtimeProbe.snapshot().eventIds.length,
      ),
    ).toBe(before);
  } finally {
    await context.setOffline(false);
    await fixture.dispose();
  }
});
