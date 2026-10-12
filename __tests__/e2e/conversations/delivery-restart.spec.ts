import { expect, test } from "../../fixtures/browser-egress/test";
import { startChatFixture } from "../../fixtures/chat05/browser";
import {
  loginChatUser,
  openChat,
  seedChatMessages,
} from "../../fixtures/chat05/ui";
import { restartPreparedGateway } from "../../fixtures/delivery/restart";

test("actual gateway restart preserves the current dialogue and converges once after offline replay", async ({
  page,
  context,
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
  resources.defer(() => context.setOffline(false));
  const connections: string[] = [];
  page.on("websocket", (socket) =>
    connections.push(new URL(socket.url()).pathname),
  );
  try {
    await loginChatUser(page, fixture.alice);
    await loginChatUser(bob, fixture.bob);
    const url = await openChat(page, fixture.bob.username);
    await bob.goto(url);
    await seedChatMessages({ page: bob, url, texts: ["gateway baseline"] });
    await expect(
      page
        .getByTestId("message-list")
        .getByText("gateway baseline", { exact: true }),
    ).toHaveCount(1);
    const before = connections.length;
    await context.setOffline(true);
    await restartPreparedGateway();
    await seedChatMessages({
      page: bob,
      url,
      texts: ["persisted while recipient offline after restart"],
    });
    await context.setOffline(false);
    await expect(
      page
        .getByTestId("message-list")
        .getByText("persisted while recipient offline after restart", {
          exact: true,
        }),
    ).toHaveCount(1, { timeout: 20000 });
    await expect(page.getByTestId("message-list").locator("li")).toHaveCount(2);
    expect(page.url()).toBe(url);
    expect(connections.length).toBeGreaterThan(before);
  } finally {
    test.setTimeout(test.info().timeout + 20000);
  }
});
