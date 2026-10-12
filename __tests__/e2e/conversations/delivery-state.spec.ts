import { expect, test } from "../../fixtures/browser-egress/test";
import { startChatFixture } from "../../fixtures/chat05/browser";
import { loginChatUser, openChat } from "../../fixtures/chat05/ui";
import { readBusinessDelivery } from "../../fixtures/delivery/browser/wire";

for (const kind of ["receipt", "unread"] as const) {
  test(`last ${kind} event retries without reconnect, next event or history polling`, async ({
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
    const state = {
      armed: false,
      dropped: 0,
      repeated: 0,
      historyReads: 0,
      connections: 0,
    };
    const identities = new Set<string>();
    try {
      await page.routeWebSocket(
        (url) => url.pathname === "/event/",
        (route) => {
          state.connections++;
          const server = route.connectToServer();
          route.onMessage((frame) => server.send(frame));
          server.onMessage((frame) => {
            const delivery = readBusinessDelivery(frame);
            const events = delivery?.events ?? [];
            const selected = events.filter((event) =>
              kind === "unread"
                ? event.type === "conversations.unread.changed"
                : event.type === "messages.receipts.updated" &&
                  event.data.receipts.some(
                    (receipt) => receipt.readAt !== null,
                  ),
            );
            if (!state.armed || selected.length === 0) {
              route.send(frame);
              return;
            }
            const identity = JSON.stringify(
              selected.map((event) => event.delivery),
            );
            identities.add(identity);
            if (state.dropped === 0) {
              state.dropped++;
              return;
            }
            state.repeated++;
            route.send(frame);
          });
        },
      );
      await loginChatUser(page, fixture.alice);
      await loginChatUser(bob, fixture.bob);
      const url = await openChat(page, fixture.bob.username);
      if (kind === "receipt") {
        await page.getByTestId("message-composer").fill("last read receipt");
        await page.getByTestId("message-composer").press("Enter");
        await expect(page.locator('[data-message-mark="sent"]')).toHaveCount(1);
      } else {
        const bootstrap = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/conversations" &&
            response.status() === 200,
        );
        await page.goto("https://localhost/");
        await bootstrap;
      }
      const connections = state.connections;
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
      state.armed = true;
      await bob.goto(url);
      if (kind === "receipt") {
        await bob.bringToFront();
        await bob.getByTestId("message-composer").focus();
        await expect(page.locator('[data-message-mark="read"]')).toHaveCount(
          1,
          { timeout: 25000 },
        );
      } else {
        await bob.getByTestId("message-composer").fill("last unread event");
        await bob.getByTestId("message-composer").press("Enter");
        await expect(
          page
            .getByRole("img", { name: "Unread messages", exact: true })
            .first(),
        ).toBeVisible({ timeout: 25000 });
      }
      expect(state.dropped).toBe(1);
      expect(state.repeated).toBeGreaterThan(0);
      expect(identities.size).toBe(1);
      expect(state.connections).toBe(connections);
      expect(state.historyReads).toBe(0);
      console.log(
        JSON.stringify({
          case: `last-${kind}`,
          ...state,
          distinctPositions: identities.size,
        }),
      );
    } finally {
      test.setTimeout(test.info().timeout + 20000);
    }
  });
}
