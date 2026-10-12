import { expect, test } from "../../fixtures/browser-egress/test";
import { startChatFixture } from "../../fixtures/chat05/browser";
import { loginChatUser, openChat } from "../../fixtures/chat05/ui";
import type {} from "../../fixtures/delivery/browser/unread";
import {
  readAcknowledgementId,
  readCommandOutcome,
  readDeliveryReply,
  readMessageDelivery,
} from "../../fixtures/delivery/browser/wire";
import { installRealtimeProbe } from "../../fixtures/realtime/install-browser";

for (const fault of ["last-event", "last-ack"] as const) {
  test(`actual UI recovers lost ${fault} without another message or history polling`, async ({
    page,
    browser,
    proxy,
  }) => {
    test.setTimeout(90000);
    await using resources = new AsyncDisposableStack();
    const fixture = await startChatFixture();
    resources.defer(fixture.dispose);
    const peer = await browser.newContext({
      proxy,
      ignoreHTTPSErrors: true,
      locale: "en-US",
    });
    resources.defer(() => peer.close());
    const bob = await peer.newPage();
    const text = `delivery ${fault} ${crypto.randomUUID()}`;
    const state = {
      armed: false,
      dropped: 0,
      deliveries: 0,
      historyReads: 0,
      acknowledged: false,
    };
    const acknowledgements = new Set<string>();
    const identities = new Set<string>();
    const codes = new Set<string>();
    const failures = new Set<string>();
    const statuses: number[] = [];
    page.on("pageerror", (error) => failures.add(error.name));
    page.on("response", (response) => {
      if (
        /\/api\/conversations\/[^/]+\/messages/.test(
          new URL(response.url()).pathname,
        )
      )
        statuses.push(response.status());
    });
    try {
      await page.routeWebSocket(
        (url) => url.pathname === "/event/",
        (route) => {
          const server = route.connectToServer();
          server.onMessage((frame) => {
            const code = readCommandOutcome(frame);
            if (code) codes.add(code);
            const delivery = readMessageDelivery(frame);
            if (delivery?.message.text !== text) {
              route.send(frame);
              return;
            }
            state.deliveries++;
            identities.add(delivery.eventId);
            acknowledgements.add(delivery.acknowledgementId);
            if (fault === "last-event" && state.dropped === 0) {
              state.dropped++;
              return;
            }
            route.send(frame);
          });
          route.onMessage((frame) => {
            const id = readAcknowledgementId(frame);
            if (id && acknowledgements.has(id)) {
              if (fault === "last-ack" && state.dropped === 0) {
                state.dropped++;
                return;
              }
              server.send(frame);
              state.acknowledged = true;
              return;
            }
            server.send(frame);
          });
        },
      );
      page.on("request", (request) => {
        if (
          state.armed &&
          request.method() === "GET" &&
          /\/api\/conversations\/[^/]+\/messages/.test(
            new URL(request.url()).pathname,
          )
        )
          state.historyReads++;
      });
      await loginChatUser(page, fixture.alice);
      await loginChatUser(bob, fixture.bob);
      const url = await openChat(page, fixture.bob.username);
      await bob.goto(url);
      await expect(page.getByTestId("message-composer")).toBeVisible();
      await expect(bob.getByTestId("message-composer")).toBeVisible();
      state.armed = true;
      await bob.getByTestId("message-composer").fill(text);
      await bob.getByTestId("message-composer").press("Enter");
      await expect
        .poll(() => state.acknowledged, { timeout: 25000 })
        .toBe(true);
      await expect(
        page.getByTestId("message-list").getByText(text, { exact: true }),
      ).toHaveCount(1);
      expect(state.dropped).toBe(1);
      expect(state.deliveries).toBeGreaterThanOrEqual(2);
      expect(identities.size).toBe(1);
      expect(state.historyReads).toBe(0);
    } finally {
      console.log(
        JSON.stringify({
          deliveryProbe: {
            fault,
            ...state,
            codes: [...codes],
            pageErrorNames: [...failures],
            statuses,
          },
        }),
      );
      test.setTimeout(test.info().timeout + 20000);
    }
  });
}

test("actual summary owner performs ten canonical BFF reads for 640 invalidations and zero for replay", async ({
  page,
}) => {
  test.setTimeout(90000);
  await using resources = new AsyncDisposableStack();
  const fixture = await startChatFixture();
  resources.defer(fixture.dispose);
  try {
    await loginChatUser(page, fixture.alice);
    await installRealtimeProbe(page, {
      entrypoint: "__tests__/fixtures/delivery/browser/unread.ts",
    });
    const result = await page.evaluate(() => window.__unreadBatchProbe());
    expect(result.baselineReads).toBe(1);
    expect(result.canonicalReads).toBe(10);
    expect(result.replayReads).toBe(0);
    expect(result.replies).toEqual([
      64, 128, 192, 256, 320, 384, 448, 512, 576, 640,
    ]);
    expect(result.replay).toMatchObject({
      kind: "applied",
      position: { cursor: 640 },
    });
  } finally {
    test.setTimeout(test.info().timeout + 20000);
  }
});

test("six transient unread 429/503 replies recover automatically without blocking the subscription", async ({
  page,
  browser,
  proxy,
}) => {
  test.setTimeout(120000);
  await using resources = new AsyncDisposableStack();
  const fixture = await startChatFixture();
  resources.defer(fixture.dispose);
  const peer = await browser.newContext({
    proxy,
    ignoreHTTPSErrors: true,
    locale: "en-US",
  });
  resources.defer(() => peer.close());
  const bob = await peer.newPage();
  const state = { armed: false, failures: 0 };
  const positions = new Set<string>();
  try {
    await page.routeWebSocket(
      (url) => url.pathname === "/event/",
      (route) => {
        const server = route.connectToServer();
        server.onMessage((frame) => route.send(frame));
        route.onMessage((frame) => {
          const reply = readDeliveryReply(frame);
          if (state.armed && reply?.kind === "retry-later")
            positions.add(JSON.stringify(reply.position));
          server.send(frame);
        });
      },
    );
    await loginChatUser(page, fixture.alice);
    await loginChatUser(bob, fixture.bob);
    const url = await openChat(page, fixture.bob.username);
    await bob.goto(url);
    const bootstrap = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/conversations" &&
        response.status() === 200,
    );
    await page.goto("https://localhost/");
    await bootstrap;
    await page.route("**/api/conversations", async (route) => {
      if (!state.armed || state.failures >= 6) {
        await route.continue();
        return;
      }
      state.failures++;
      await route.fulfill({
        status: state.failures % 2 === 0 ? 429 : 503,
        headers: { "Retry-After": "0" },
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: { code: "DEPENDENCY_UNAVAILABLE" },
        }),
      });
    });
    state.armed = true;
    await bob
      .getByTestId("message-composer")
      .fill("one unread event after temporary outage");
    await bob.getByTestId("message-composer").press("Enter");
    await expect(
      page.getByRole("img", { name: "Unread messages", exact: true }).first(),
    ).toBeVisible({ timeout: 90000 });
    expect(state.failures).toBe(6);
    expect(positions.size).toBe(1);
  } finally {
    test.setTimeout(test.info().timeout + 20000);
  }
});
