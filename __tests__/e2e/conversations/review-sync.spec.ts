import { expect, test } from "../../fixtures/browser-egress/test";
import { startChatFixture } from "../../fixtures/chat05/browser";
import {
  loginChatUser,
  openChat,
  seedChatMessages,
} from "../../fixtures/chat05/ui";

test("review I1 actual earlier-page then Bob WS53 keeps live chat", async ({
  page,
  browser,
  proxy,
}) => {
  test.setTimeout(90000);
  const fixture = await startChatFixture();
  const peer = await browser.newContext({
    proxy,
    ignoreHTTPSErrors: true,
    locale: "en-US",
  });
  const bob = await peer.newPage();
  try {
    await loginChatUser(page, fixture.alice);
    await loginChatUser(bob, fixture.bob);
    const url = await openChat(page, fixture.bob.username);
    await seedChatMessages({
      page,
      url,
      texts: Array.from({ length: 52 }, (_, n) => `I1 persisted ${n + 1}`),
    });
    await page.reload();
    await bob.goto(url);
    await expect(page.getByTestId("message-list").locator("li")).toHaveCount(
      50,
    );
    const earlier = page.waitForResponse(
      (r) => r.url().includes("/messages?cursor=") && r.status() === 200,
    );
    await page
      .getByRole("button", { name: "Load earlier messages", exact: true })
      .click();
    await earlier;
    await expect(
      page
        .getByTestId("message-list")
        .getByText("I1 persisted 1", { exact: true }),
    ).toHaveCount(1);
    await expect(page.getByTestId("message-list").locator("li")).toHaveCount(
      52,
    );
    await bob.getByTestId("message-composer").fill("I1 Bob WS53 after earlier");
    await bob.getByTestId("message-composer").press("Enter");
    await expect(
      page
        .getByTestId("message-list")
        .getByText("I1 Bob WS53 after earlier", { exact: true }),
    ).toHaveCount(1);
    await expect(page.getByTestId("message-list").locator("li")).toHaveCount(
      53,
    );
  } finally {
    await peer.close();
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});
test("review I2 paused snapshot then lost WS3 retries before WS4 without REST followup", async ({
  page,
  browser,
  proxy,
}) => {
  test.setTimeout(90000);
  const fixture = await startChatFixture();
  const peer = await browser.newContext({
    proxy,
    ignoreHTTPSErrors: true,
    locale: "en-US",
  });
  const bob = await peer.newPage();
  const release = Promise.withResolvers<void>();
  const phase = {
    armed: false,
    released: false,
    held: 0,
    followup: 0,
    dropped: 0,
    buffered: 0,
  };
  try {
    await page.routeWebSocket(
      (url) => url.pathname === "/event/",
      (route) => {
        const server = route.connectToServer();
        route.onMessage((frame) => {
          server.send(frame);
        });
        server.onMessage((frame) => {
          if (
            !phase.armed ||
            typeof frame !== "string" ||
            !frame.includes('"messages.created"')
          ) {
            route.send(frame);
            return;
          }
          if (frame.includes("I2 lost WS3") && phase.dropped === 0) {
            phase.dropped++;
            return;
          }
          route.send(frame);
          phase.buffered += Number(frame.includes("I2 buffered WS4"));
        });
      },
    );
    await loginChatUser(page, fixture.alice);
    await loginChatUser(bob, fixture.bob);
    const url = await openChat(page, fixture.bob.username);
    await seedChatMessages({
      page,
      url,
      texts: ["I2 persisted 1", "I2 persisted 2"],
    });
    await bob.goto(url);
    await page.route(
      `**/api${new URL(url).pathname}/messages?after=0`,
      async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        if (!phase.released) {
          expect(
            body.data.items.map(
              (message: { sequence: number }) => message.sequence,
            ),
          ).toEqual([1, 2]);
          phase.held++;
          await release.promise;
        } else {
          phase.followup++;
          expect(
            body.data.items.map((m: { sequence: number }) => m.sequence),
          ).toEqual([1, 2, 3, 4]);
        }
        await route.fulfill({ response });
      },
    );
    phase.armed = true;
    await page.reload();
    await expect.poll(() => phase.held, { timeout: 15000 }).toBeGreaterThan(0);
    await bob.getByTestId("message-composer").fill("I2 lost WS3");
    await bob.getByTestId("message-composer").press("Enter");
    await bob.getByTestId("message-composer").fill("I2 buffered WS4");
    await bob.getByTestId("message-composer").press("Enter");
    expect(
      await page
        .getByTestId("message-list")
        .getByText("I2 lost WS3", { exact: true })
        .count(),
    ).toBe(0);
    phase.released = true;
    release.resolve();
    await expect.poll(() => phase.dropped, { timeout: 15000 }).toBe(1);
    await expect
      .poll(() => phase.buffered, { timeout: 20000 })
      .toBeGreaterThan(0);
    await expect(
      page
        .getByTestId("message-list")
        .getByText("I2 lost WS3", { exact: true }),
    ).toHaveCount(1);
    await expect(
      page
        .getByTestId("message-list")
        .getByText("I2 buffered WS4", { exact: true }),
    ).toHaveCount(1);
    await expect(page.getByTestId("message-list").locator("li")).toHaveCount(4);
    expect(phase.held).toBeGreaterThanOrEqual(1);
    expect(phase.followup).toBe(0);
    expect(phase.dropped).toBe(1);
  } finally {
    release.resolve();
    await page.unrouteAll({ behavior: "wait" });
    await peer.close();
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});
