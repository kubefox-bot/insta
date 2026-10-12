import { logoutUser } from "../../fixtures/auth05/ui";
import { expect, test } from "../../fixtures/browser-egress/test";
import {
  controlSessionFault,
  currentSessionCookie,
  inspectSessionFault,
  loginMainUser,
  startSessionFaultFixture,
} from "./lib/faults";

test("E03 owned native revoke outage persists block; actual main logout UI says pending and Back/reload cannot regain S1", async ({
  page,
  context,
}) => {
  const fixture = await startSessionFaultFixture();
  try {
    await loginMainUser(page, fixture.account);
    const cookie = await currentSessionCookie(context);
    const options = { page, url: fixture.url, cookie };
    await controlSessionFault({ ...options, action: "revoke-down" });
    const statuses: string[] = [];
    await page.route("https://localhost/", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch({
        url: `${fixture.url}/logout-form`,
        headers: {
          ...(await route.request().allHeaders()),
          cookie,
          origin: "https://localhost",
        },
      });
      expect(response.headers()["set-cookie"]).toBeUndefined();
      statuses.push((await response.json()).type);
      await route.fulfill({ response });
    });
    await logoutUser(page);
    await expect(page.getByTestId("current-actor")).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText(
      "server confirmation pending",
    );
    expect(await currentSessionCookie(context)).toBe(cookie);
    expect(await inspectSessionFault(options)).toMatchObject({
      blocked: true,
      pending: true,
    });
    await page.goBack();
    await page.reload();
    await expect(page.getByTestId("current-actor")).toHaveCount(0);
    const blocked = await page.request.get("https://localhost/api/session");
    expect(blocked.status()).toBe(401);
    expect(blocked.headers()["set-cookie"]).toBeUndefined();
    expect(statuses).toEqual(["success"]);
    await controlSessionFault({ ...options, action: "revoke-up" });
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});

test("E08 actual two BFF processes and two tabs fence late invalid refresh after takeover; no cookie mutation", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  const fixture = await startSessionFaultFixture();
  const second = await context.newPage();
  const releaseBackground = Promise.withResolvers<void>();
  try {
    await loginMainUser(page, fixture.account);
    const cookie = await currentSessionCookie(context);
    const options = { page, url: fixture.url, cookie };
    await context.route("**/api/session", async (route) => {
      if (route.request().headers()["x-owned-refresh-probe"] !== "held") {
        await releaseBackground.promise;
        return route.continue();
      }
      const response = await route.fetch({
        url: `${fixture.url}/session`,
        headers: { ...(await route.request().allHeaders()), cookie },
      });
      expect(response.headers()["set-cookie"]).toBeUndefined();
      await route.fulfill({ response });
    });
    await second.goto("https://localhost/");
    await controlSessionFault({ ...options, action: "held-invalid" });
    await controlSessionFault({ ...options, action: "expire-access" });
    const old = page.evaluate(async () => {
      const response = await fetch("/api/session", {
        headers: { "x-owned-refresh-probe": "held" },
      });
      return { status: response.status, body: await response.json() };
    });
    await expect
      .poll(async () => (await inspectSessionFault(options)).entered)
      .toBe(true);
    const before = await inspectSessionFault(options);
    await controlSessionFault({ ...options, action: "expire-lease" });
    const takeover = await second.request.get("https://localhost/api/session");
    expect(takeover.status()).toBe(200);
    expect(takeover.headers()["set-cookie"]).toBeUndefined();
    const confirmed = await takeover.json();
    await controlSessionFault({ ...options, action: "release" });
    expect((await old).body.data).toEqual(confirmed.data);
    releaseBackground.resolve();
    const after = await inspectSessionFault(options);
    expect(after).toMatchObject({
      blocked: false,
      revision: before.revision + 1,
    });
    expect(after.refreshKeys).toEqual([before.attemptKey]);
    expect(await currentSessionCookie(context)).toBe(cookie);
    const subsequent = await page.request.get("https://localhost/api/session");
    expect(subsequent.status()).toBe(200);
    expect((await subsequent.json()).data).toEqual(confirmed.data);
    await page.reload();
    await expect(page.getByTestId("current-actor")).toBeVisible();
  } finally {
    releaseBackground.resolve();
    const cookie = await currentSessionCookie(context).catch(() => "");
    if (cookie)
      await controlSessionFault({
        page,
        url: fixture.url,
        cookie,
        action: "release",
      });
    await context.unrouteAll({ behavior: "wait" });
    await second.close();
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});

test("E08 browser recovery after old expiry preserves attempt cutoff; exact server cutoff requires login without deleting cookie", async ({
  page,
  context,
}) => {
  const fixture = await startSessionFaultFixture();
  const releaseBackground = Promise.withResolvers<void>();
  try {
    await loginMainUser(page, fixture.account);
    const cookie = await currentSessionCookie(context);
    const options = { page, url: fixture.url, cookie };
    await context.route("**/api/session", async (route) => {
      if (route.request().headers()["x-owned-refresh-probe"] !== "recovery") {
        await releaseBackground.promise;
        return route.continue();
      }
      const response = await route.fetch({
        url: `${fixture.url}/session`,
        headers: { ...(await route.request().allHeaders()), cookie },
      });
      expect(response.headers()["set-cookie"]).toBeUndefined();
      await route.fulfill({ response });
    });
    await controlSessionFault({ ...options, action: "unknown-refresh" });
    await controlSessionFault({ ...options, action: "expire-access" });
    const unknown = await page.evaluate(async () => {
      const response = await fetch("/api/session", {
        headers: { "x-owned-refresh-probe": "recovery" },
      });
      return { status: response.status, body: await response.json() };
    });
    expect(unknown).toMatchObject({
      status: 503,
      body: { error: { code: "SESSION_UNAVAILABLE" } },
    });
    const before = await inspectSessionFault(options);
    expect(before.recoverUntil).toBeDefined();
    await controlSessionFault({ ...options, action: "expire-original" });
    const recovered = await page.evaluate(async () => {
      const response = await fetch("/api/session", {
        headers: { "x-owned-refresh-probe": "recovery" },
      });
      return { status: response.status, body: await response.json() };
    });
    expect(recovered.status).toBe(200);
    const recoveredState = await inspectSessionFault(options);
    expect(recoveredState.revision).toBe(before.revision + 1);
    expect(recoveredState.refreshKeys.at(-1)).toBe(before.attemptKey);
    expect(await currentSessionCookie(context)).toBe(cookie);
    await controlSessionFault({ ...options, action: "expire-access" });
    await controlSessionFault({ ...options, action: "unknown-refresh" });
    const lostAgain = await page.evaluate(async () => {
      const response = await fetch("/api/session", {
        headers: { "x-owned-refresh-probe": "recovery" },
      });
      return response.status;
    });
    expect(lostAgain).toBe(503);
    const cutoffAttempt = await inspectSessionFault(options);
    await controlSessionFault({ ...options, action: "cutoff" });
    const expired = await page.evaluate(async () => {
      const response = await fetch("/api/session", {
        headers: { "x-owned-refresh-probe": "recovery" },
      });
      return { status: response.status, body: await response.json() };
    });
    expect(expired).toMatchObject({
      status: 401,
      body: { error: { code: "SESSION_REQUIRED" } },
    });
    const after = await inspectSessionFault(options);
    expect(after.blocked).toBe(true);
    expect(after.recoverUntil).toBe(cutoffAttempt.recoverUntil);
    expect(after.refreshKeys).toEqual(cutoffAttempt.refreshKeys);
    expect(await currentSessionCookie(context)).toBe(cookie);
    releaseBackground.resolve();
    await page.reload();
    await expect(page.getByTestId("current-actor")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Sign in", exact: true }).first(),
    ).toBeVisible();
  } finally {
    releaseBackground.resolve();
    await context.unrouteAll({ behavior: "wait" });
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});
