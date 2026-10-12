import { z } from "zod";
import { readInfraConfig } from "../../../scripts/infra/config";
import { cleanupResources } from "../../../scripts/testing/cleanup";
import { waitUntil } from "../../fixtures/barrier";
import { expect, test } from "../../fixtures/browser-egress/test";
import { docker } from "../../fixtures/docker";

test("real browser cookie survives delayed S1 logout after S2 login (AUTH-04 transport slice)", async ({
  page,
  context,
  request,
}) => {
  const runId = `insta-auth04-${crypto.randomUUID()}`;
  const id = await docker(
    "compose",
    "--project-name",
    readInfraConfig().project,
    "run",
    "-d",
    "--no-deps",
    "--name",
    runId,
    "--label",
    `insta.testRunId=${runId}`,
    "-p",
    "127.0.0.1::3002",
    "testhost",
    "bun",
    "__tests__/fixtures/bff-session/browser-host.ts",
  );
  try {
    const port = (await docker("port", id, "3002/tcp")).split(":").at(-1);
    const fixtureUrl = `http://127.0.0.1:${port}`;
    await waitUntil({
      check: () =>
        fetch(fixtureUrl).then(
          async (response) => {
            await response.body?.cancel();
            return response.ok;
          },
          () => false,
        ),
    });
    const credentials = z
      .object({
        account: z.object({ email: z.email(), password: z.string() }),
        secondAccount: z.object({ email: z.email(), password: z.string() }),
      })
      .parse(await (await request.get(fixtureUrl)).json());
    await page.goto("http://localhost");
    await expect(page).toHaveURL(/^https:\/\/localhost/);
    const first = await page.evaluate(async (account) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(account),
      });
      return { status: response.status, text: await response.text() };
    }, credentials.account);
    expect(first.status).toBe(200);
    for (const secret of [
      "accessToken",
      "refreshToken",
      "revokeSecret",
      "registrationProof",
      "bindingId",
    ])
      expect(first.text).not.toContain(secret);
    const initialCookie = (await context.cookies()).find(
      (cookie) => cookie.name === "insta_session",
    );
    expect(initialCookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
    });
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      "insta_session",
    );
    const reached = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    await page.route("**/api/session/logout", async (route) => {
      const response = await route.fetch();
      expect(response.headers()["set-cookie"]).toBeUndefined();
      reached.resolve();
      await release.promise;
      await route.fulfill({ response });
    });
    const oldLogout = page.evaluate(async () => {
      const response = await fetch("/api/session/logout", { method: "POST" });
      return { status: response.status, body: await response.json() };
    });
    await reached.promise;
    const second = await page.evaluate(async (account) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(account),
      });
      return { status: response.status, body: await response.json() };
    }, credentials.secondAccount);
    expect(second.status).toBe(200);
    const newCookie = (await context.cookies()).find(
      (cookie) => cookie.name === "insta_session",
    );
    expect(newCookie?.value).not.toBe(initialCookie?.value);
    release.resolve();
    expect((await oldLogout).body).toMatchObject({
      ok: true,
      data: { revocation: "confirmed" },
    });
    expect(
      (await context.cookies()).find(
        (cookie) => cookie.name === "insta_session",
      )?.value,
    ).toBe(newCookie?.value);
    const current = await page.evaluate(async () => {
      const response = await fetch("/api/session");
      return { status: response.status, body: await response.json() };
    });
    expect(current.status).toBe(200);
    expect(current.body.data).toEqual(second.body.data);
    const html = await page.content();
    for (const secret of [initialCookie?.value, newCookie?.value]) {
      if (secret) expect(html).not.toContain(secret);
    }
    const expired = await request.get("https://localhost/api/session", {
      headers: { cookie: `insta_session=${initialCookie?.value}` },
    });
    expect(expired.status()).toBe(401);
    expect(expired.headers()["set-cookie"]).toBeUndefined();
  } finally {
    test.setTimeout(test.info().timeout + 20000);
    await docker("stop", "--time", "15", id);
    const exitCode = await docker(
      "inspect",
      "--format",
      "{{.State.ExitCode}}",
      id,
    );
    await cleanupResources({
      testRunId: runId,
      resources: [{ kind: "container", id }],
      execute: docker,
    });
    expect(exitCode).toBe("0");
  }
});
