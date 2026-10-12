import { z } from "zod";
import { safeFaroBodySchema } from "../../apps/fe-insta/src/lib/observability/client/index";
import { readInfraConfig } from "../../scripts/infra/config";
import { expect, test } from "../fixtures/browser-egress/test";
import { docker } from "../fixtures/docker";

const receipts = async () => {
  const summary = await docker(
    "compose",
    "--project-name",
    readInfraConfig().project,
    "--profile",
    "telemetry",
    "exec",
    "-T",
    "--user",
    "bun",
    "telemetry-receiver",
    "bun",
    "-e",
    'const value=await(await fetch("http://127.0.0.1:4318/receipts",{signal:AbortSignal.timeout(5000)})).json();console.log(JSON.stringify(value.receipts));',
  );
  return z
    .array(z.object({ protocol: z.string(), count: z.number().int() }))
    .parse(JSON.parse(summary))
    .filter((receipt) => receipt.protocol === "faro-json-v1");
};

test("E12 main packaged Faro sends sanitized exceptions only after PRIV01 all and actual receiver receipt", async ({
  page,
}) => {
  const marker = "DONE02_PRIVATE_ERROR_QUERY_CANARY";
  const posts: unknown[] = [];
  const statuses: number[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const before = (await receipts()).length;
  await page.route("**/api/telemetry/faro", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const wire = route.request().postDataJSON();
    expect(JSON.stringify(wire)).not.toContain(marker);
    const body = safeFaroBodySchema.parse(wire.body);
    const response = await route.fetch();
    statuses.push(response.status());
    posts.push(body);
    await route.fulfill({ response });
  });
  try {
    await page.goto("https://localhost/");
    const capability = () =>
      page.request
        .get("https://localhost/api/telemetry/faro")
        .then((response) => response.json());
    expect((await capability()).enabled).toBe(false);
    await page
      .getByRole("button", { name: "Accept all cookies", exact: true })
      .click();
    await expect.poll(async () => (await capability()).enabled).toBe(true);
    await page.evaluate(
      (message) =>
        window.dispatchEvent(
          new ErrorEvent("error", {
            message,
            filename: `https://localhost/private?secret=${message}`,
            error: new Error(message),
          }),
        ),
      marker,
    );
    await expect
      .poll(
        () =>
          posts.filter(
            (body) => safeFaroBodySchema.parse(body).exceptions?.length,
          ).length,
      )
      .toBeGreaterThanOrEqual(1);
    expect(statuses.every((status) => status === 204)).toBe(true);
    await expect
      .poll(async () => (await receipts()).length)
      .toBeGreaterThan(before);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("menuitem", { name: "Cookie settings", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Cookie settings", exact: true })
      .getByRole("button", { name: "Necessary cookies only", exact: true })
      .click();
    await expect.poll(async () => (await capability()).enabled).toBe(false);
    const delivered = posts.length;
    await page.evaluate(
      (message) => window.dispatchEvent(new ErrorEvent("error", { message })),
      marker,
    );
    const barrier = await page.request.get(
      "https://localhost/api/telemetry/faro",
    );
    expect((await barrier.json()).enabled).toBe(false);
    expect(posts).toHaveLength(delivered);
    expect(pageErrors).toEqual([]);
    console.log(
      JSON.stringify({
        boundary: "packaged-main-faro",
        browser: test.info().project.name,
        safePosts: posts.length,
        receiverReceiptDelta: (await receipts()).length - before,
        trust: "scoped test TLS bypass",
      }),
    );
  } finally {
    await page.unrouteAll({ behavior: "wait" });
  }
});
