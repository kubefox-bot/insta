import { createConsentHost } from "../../../apps/fe-insta/__tests__/privacy/host";
import { savePrivacyPreference400Schema } from "../../../apps/fe-insta/src/lib/api/generated/schemas/savePrivacyPreferenceSchema";
import { readInfraConfig } from "../../../scripts/infra/config";
import { cleanupResources } from "../../../scripts/testing/cleanup";
import type { OwnedResource } from "../../../scripts/testing/types";
import { waitUntil } from "../../fixtures/barrier";
import { expect, test } from "../../fixtures/browser-egress/test";
import { docker } from "../../fixtures/docker";

const state: {
  host?: Awaited<ReturnType<typeof createConsentHost>>;
  container?: string;
  runId: string;
  backendURL?: string;
  frontendURL?: string;
  frontendContainer?: string;
  resources: OwnedResource[];
} = { runId: `insta-priv01-${crypto.randomUUID()}`, resources: [] };
test.beforeAll(async () => {
  const id = await docker(
    "compose",
    "--project-name",
    readInfraConfig().project,
    "run",
    "-d",
    "--no-deps",
    "--name",
    `${state.runId}-privacy`,
    "--label",
    `insta.testRunId=${state.runId}`,
    "-p",
    "127.0.0.1::3001",
    "testhost",
    "bun",
    "--cwd",
    "apps/be-insta",
    "__tests__/privacy/host.ts",
  );
  state.container = id;
  state.resources.push({ kind: "container", id });
  const port = (await docker("port", id, "3001/tcp")).split(":").at(-1);
  const backendURL = `http://127.0.0.1:${port}`;
  await waitUntil({
    check: async () =>
      fetch(`${backendURL}/health/live`).then(
        async (response) => {
          await response.body?.cancel();
          return response.ok;
        },
        () => false,
      ),
  });
  state.backendURL = backendURL;
  state.host = await createConsentHost({
    frontendURL: () => {
      if (!state.frontendURL) throw new Error("Built BFF not connected");
      return state.frontendURL;
    },
  });
  const frontend = await docker(
    "compose",
    "--project-name",
    readInfraConfig().project,
    "run",
    "-d",
    "--no-deps",
    "--name",
    `${state.runId}-web`,
    "--label",
    `insta.testRunId=${state.runId}`,
    "-p",
    "127.0.0.1::3000",
    "--env",
    `API_BASE_URL=http://${state.runId}-privacy:3001`,
    "fe-insta",
  );
  state.frontendContainer = frontend;
  state.resources.push({ kind: "container", id: frontend });
  const webPort = (await docker("port", frontend, "3000/tcp"))
    .split(":")
    .at(-1);
  state.frontendURL = `http://127.0.0.1:${webPort}`;
  await waitUntil({
    check: async () =>
      fetch(`${state.frontendURL}/api/health/ready`).then(
        async (response) => {
          await response.body?.cancel();
          return response.ok;
        },
        () => false,
      ),
  });
});
test.afterAll(async () => {
  try {
    await state.host?.close();
    for (const container of [state.frontendContainer, state.container].filter(
      (value): value is string => typeof value === "string",
    )) {
      await docker("stop", "--time", "10", container);
      expect(
        await docker("inspect", "--format", "{{.State.ExitCode}}", container),
      ).toBe("0");
    }
    const logs = (
      await Promise.all(
        [state.frontendContainer, state.container]
          .filter((value): value is string => typeof value === "string")
          .map((container) => docker("logs", container)),
      )
    ).join("\n");
    expect(logs).not.toContain("CANARY_privacy");
    expect(logs).toContain("http_request");
  } finally {
    await cleanupResources({
      testRunId: state.runId,
      resources: state.resources,
      execute: docker,
    });
  }
});
test("SSR/default → necessary → all → settings/revoke, reload, multi-tab and negative optional network", async ({
  page,
  context,
  browser,
}) => {
  const host = state.host;
  if (!host) throw new Error("Standalone host unavailable");
  const optionalRequests: string[] = [];
  const faults: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().includes("optional-adapter") ||
      request.url().includes("/__test__/observation")
    )
      optionalRequests.push(request.url());
  });
  page.on("pageerror", (error) => faults.push(error.message));
  await page.goto(host.url);
  const wire = await context.request.get(`${host.url}/api/privacy/consent`);
  expect(Object.keys(await wire.json()).sort()).toEqual([
    "choice",
    "policyVersion",
    "revision",
  ]);
  await expect.poll(() => faults).toEqual([]);
  await expect(
    page.getByRole("button", { name: "Necessary cookies only" }),
  ).toBeVisible();
  await expect(page.getByTestId("choice")).toHaveText("necessary");
  await page.getByRole("button", { name: "Observation", exact: true }).click();
  expect(optionalRequests).toHaveLength(0);
  const savedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/privacy/consent") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Necessary cookies only" }).click();
  const selectionResponse = await savedResponse;
  expect(selectionResponse.status(), JSON.stringify(host.failures)).toBe(200);
  expect(faults).toEqual([]);
  await expect(page.getByTestId("revision")).toHaveText("1");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Accept all cookies" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Observation", exact: true }).click();
  expect(optionalRequests).toHaveLength(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Cookie settings", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Cookie settings", exact: true })
    .getByRole("button", { name: "Accept all cookies" })
    .click();
  await expect(page.getByTestId("choice")).toHaveText("all");
  await page
    .getByRole("dialog", { name: "Cookie settings", exact: true })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-optional-active",
    "2",
  );
  await page.getByRole("button", { name: "Observation", exact: true }).click();
  await expect.poll(() => host.observations.length).toBe(1);
  const cookie = (await context.cookies()).find(
    (entry) => entry.name === "insta_consent",
  );
  expect(cookie).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  });
  expect(await page.content()).not.toContain(cookie?.value ?? "COOKIE_MISSING");
  await page
    .getByRole("textbox", { name: "Functional queue" })
    .fill("queued functional message");
  const second = await context.newPage();
  await second.goto(host.url);
  await expect(second.getByTestId("choice")).toHaveText("all");
  await second.getByRole("button", { name: "Settings", exact: true }).click();
  await second
    .getByRole("menuitem", { name: "Cookie settings", exact: true })
    .click();
  await second
    .getByRole("dialog", { name: "Cookie settings", exact: true })
    .getByRole("button", { name: "Necessary cookies only" })
    .click();
  await expect(second.getByTestId("revision")).toHaveText("3");
  await expect(page.getByTestId("choice")).toHaveText("necessary");
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-optional-active",
  );
  const requestsBefore = optionalRequests.length;
  await page.getByRole("button", { name: "Observation", exact: true }).click();
  expect(optionalRequests).toHaveLength(requestsBefore);
  expect(host.observations).toHaveLength(1);
  await expect(
    page.getByRole("textbox", { name: "Functional queue" }),
  ).toHaveValue("queued functional message");
  const stale = await context.request.post(
    `${host.url}/__test__/observation?revision=2`,
  );
  expect(stale.status()).toBe(403);
  expect(host.observations).toHaveLength(1);
  await page.reload();
  await expect(page.getByTestId("choice")).toHaveText("necessary");
  expect(faults).toEqual([]);
  console.log(
    `verified ${browser.browserType().name()} ${browser.version()} consent standalone`,
  );
});

test("native DTO/proof trust, small payload and concurrent CAS use actual Nest transport", async () => {
  const url = state.backendURL;
  if (!url) throw new Error("Native host missing");
  const read = await fetch(
    `${url}/v1/privacy/preferences?token=CANARY_privacy`,
    {
      headers: { "X-Consent-Context": "true", authorization: "CANARY_privacy" },
    },
  );
  expect((await read.json()).data.choice).toBe("necessary");
  const post = (input: unknown, proof?: string) =>
    fetch(`${url}/v1/privacy/preferences`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(proof ? { "X-Consent-Context": proof } : {}),
      },
      body: JSON.stringify(input),
    });
  const invalid = await post({
    choice: "all",
    policyVersion: 1,
    consent: true,
  });
  expect(invalid.status).toBe(400);
  expect(
    savePrivacyPreference400Schema.safeParse(await invalid.json()).success,
  ).toBe(true);
  expect(
    (await post({ choice: "all", policyVersion: 1 }, "FORGED")).status,
  ).toBe(400);
  const oversized = await fetch(`${url}/v1/privacy/preferences`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body:
      JSON.stringify({ choice: "all", policyVersion: 1 }) + " ".repeat(4096),
  });
  expect(oversized.status).toBe(413);
  const initial = await post({ choice: "all", policyVersion: 1 });
  expect(initial.status).toBe(200);
  const saved = await initial.json();
  const forgedWeb = await fetch(`${state.frontendURL}/api/privacy/consent`, {
    headers: { "X-Consent-Context": saved.data.contextProof },
  });
  expect((await forgedWeb.json()).choice).toBe("necessary");
  const outcomes = await Promise.all(
    ["all", "necessary"].map((choice) =>
      post(
        { choice, policyVersion: 1, expectedRevision: 1 },
        saved.data.contextProof,
      ),
    ),
  );
  expect(outcomes.map((response) => response.status).sort()).toEqual([
    200, 409,
  ]);
  for (const response of outcomes) await response.body?.cancel();
});
test("mobile keyboard choice uses equal controls and SSR public state under reduced motion", async ({
  page,
  context,
}) => {
  const host = state.host;
  if (!host) throw new Error("Standalone host unavailable");
  await page.setViewportSize({ width: 375, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await context.request.get(host.url);
  const html = await response.text();
  expect(html).toContain("Necessary cookies only");
  expect(html).not.toContain("contextProof");
  expect(html).not.toContain("generation");
  await page.goto(host.url);
  const necessary = page.getByRole("button", {
    name: "Necessary cookies only",
  });
  const all = page.getByRole("button", { name: "Accept all cookies" });
  await expect(necessary).toBeVisible();
  await expect(all).toBeVisible();
  const boxes = await Promise.all([necessary.boundingBox(), all.boundingBox()]);
  for (const box of boxes) {
    if (!box) throw new Error("Missing mobile control");
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(192);
  }
  expect(boxes[0]?.width).toBe(boxes[1]?.width);
  await necessary.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("revision")).toHaveText("1");
  await expect(page.getByTestId("choice")).toHaveText("necessary");
});
