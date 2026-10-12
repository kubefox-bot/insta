import type {} from "../fixtures/analytics/browser";
import { createAnalyticsBrowserHost } from "../fixtures/analytics/host";
import { expect, test } from "../fixtures/browser-egress/test";
import { startChatFixture } from "../fixtures/chat05/browser";
import { loginChatUser, openChat } from "../fixtures/chat05/ui";

test("E12 actual lazy Faro SDK sanitizes before same-origin receipt and stops owned error observers", async ({
  page,
}) => {
  const { server, bodyKinds, receipts } = await createAnalyticsBrowserHost();
  const unexpected: string[] = [];
  page.on("pageerror", (error) => unexpected.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${server.port}/`);
    expect(await receipts()).toEqual([]);
    await page.evaluate(() => window.__analyticsProbe.outage());
    expect(unexpected).toEqual([]);
    await page.evaluate(() => window.__analyticsProbe.start());
    await page.evaluate(() => window.__analyticsProbe.fault());
    await expect
      .poll(() => bodyKinds.filter((kind) => kind === "exception").length)
      .toBe(1);
    await page.evaluate(() => window.__analyticsProbe.stop());
    expect(
      await page.evaluate(() =>
        window.__analyticsProbe.normalErrorOwnerPreserved(),
      ),
    ).toBe(true);
    const before = await receipts();
    await page.evaluate(() => window.__analyticsProbe.fault());
    expect(await receipts()).toEqual(before);
    console.log(
      JSON.stringify({ boundary: "faro-safe-browser-receipt", bodyKinds }),
    );
  } finally {
    await server.stop(true);
  }
});

test("E09 send committed response lost then retry WS delivery history recovery preserves one logical message", async ({
  page,
  browser,
  proxy,
}) => {
  test.setTimeout(90000);
  const fixture = await startChatFixture();
  const peerContext = await browser.newContext({
    proxy,
    ignoreHTTPSErrors: true,
    locale: "en-US",
  });
  const peer = await peerContext.newPage();
  const attempts: { requestId: string; operationId: string; key: string }[] =
    [];
  const responses: unknown[] = [];
  let lost = false;
  try {
    const consent = await (
      await fetch(`${fixture.url}/analytics-consent`)
    ).json();
    await page.context().addCookies([
      {
        name: "insta_consent",
        value: consent.cookie,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ]);
    await loginChatUser(page, fixture.alice);
    await loginChatUser(peer, fixture.bob);
    const url = await openChat(page, fixture.bob.username);
    await peer.goto(url);
    await page.route(
      `**/api${new URL(url).pathname}/messages`,
      async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        const headers = route.request().headers();
        const response = await route.fetch();
        const body = await response.json();
        // The BFF allocates correlation for a browser request without this header.
        const requestId = response.headers()["x-request-id"] ?? "";
        expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
        expect(body.meta.requestId).toBe(requestId);
        attempts.push({
          requestId,
          operationId: headers["x-operation-id"] ?? "",
          key: headers["x-idempotency-key"] ?? "",
        });
        responses.push(body);
        if (!lost) {
          lost = true;
          await route.abort("failed");
          return;
        }
        await route.fulfill({ response });
      },
    );
    await page
      .getByTestId("message-composer")
      .fill("DONE01 lost response message");
    await page.getByTestId("message-composer").press("Enter");
    await expect(
      peer
        .getByTestId("message-list")
        .getByText("DONE01 lost response message", { exact: true }),
    ).toHaveCount(1);
    await expect
      .poll(() => attempts.length, { timeout: 20000 })
      .toBeGreaterThanOrEqual(2);
    expect(new Set(attempts.map((value) => value.requestId)).size).toBe(
      attempts.length,
    );
    expect(new Set(attempts.map((value) => value.operationId)).size).toBe(1);
    expect(new Set(attempts.map((value) => value.key)).size).toBe(1);
    expect(responses[0]).toMatchObject({ ok: true });
    expect(responses[1]).toMatchObject({ ok: true });
    const conversationId = new URL(url).pathname.split("/").at(-1);
    const canonical = async () =>
      await (
        await fetch(`${fixture.url}/canonical?conversationId=${conversationId}`)
      ).json();
    await expect
      .poll(async () => (await canonical())[0]?.logOnly)
      .toBe("delivered");
    const records = await canonical();
    expect(records).toHaveLength(1);
    expect(records[0]?.operationId).toBe(attempts[0]?.operationId);
    expect(records[0]?.analyticsEventId).toMatch(/^[0-9a-f-]{36}$/);
    await expect
      .poll(async () => (await canonical())[0]?.realtimeState)
      .toBe("delivered");
    const beforeReplay = await canonical();
    const replay = await fetch(
      `${fixture.url}/replay-canonical?conversationId=${conversationId}`,
      { method: "POST" },
    );
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      reset: true,
      eventId: records[0]?.eventId,
    });
    await expect
      .poll(async () => (await canonical())[0]?.realtimeAttempts)
      .toBeGreaterThan(beforeReplay[0]?.realtimeAttempts);
    await expect
      .poll(async () => (await canonical())[0]?.realtimeState)
      .toBe("delivered");
    await expect(
      peer
        .getByTestId("message-list")
        .getByText("DONE01 lost response message", { exact: true }),
    ).toHaveCount(1);
    const afterReplay = await canonical();
    expect(afterReplay[0]?.analyticsEventId).toBe(records[0]?.analyticsEventId);
    expect(afterReplay[0]?.logOnly).toBe("delivered");
    await page.reload();
    await expect(
      page
        .getByTestId("message-list")
        .getByText("DONE01 lost response message", { exact: true }),
    ).toHaveCount(1);
    expect(await canonical()).toEqual(afterReplay);
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    await peerContext.close();
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});
