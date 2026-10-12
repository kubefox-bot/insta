import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "@kubb/core";
import { pluginOas } from "@kubb/plugin-oas";
import { pluginTs } from "@kubb/plugin-ts";

test("Nest bootstrap resolves health provider and exposes live/ready over HTTP", async () => {
  const bootstrap = new URL(
    "../../apps/be-insta/dist/app/bootstrap.js",
    import.meta.url,
  );
  expect(await Bun.file(bootstrap).exists()).toBe(true);
  const { createApplication } = await import(bootstrap.pathname);
  const app = await createApplication({
    checkRequired: async () => true,
    check: async () => ({ ready: true, mail: "ok", delivery: "ok" }),
    close: async () => {},
  });
  try {
    await app.listen(0, "127.0.0.1");
    const baseUrl = await app.getUrl();
    for (const path of ["/health/live", "/health/ready"]) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: true,
        data: { status: "ok" },
      });
    }
  } finally {
    await app.close();
  }
});

test("Bun native decorators resolve explicit DI and Nest12 validates Zod DTOs", async () => {
  const root = new URL("../../apps/be-insta", import.meta.url).pathname;
  const probe = Bun.spawn(
    [process.execPath, "__tests__/compatibility/probe.ts"],
    { cwd: root, stdout: "pipe", stderr: "pipe", timeout: 10000 },
  );
  const [output, errors, exitCode] = await Promise.all([
    new Response(probe.stdout).text(),
    new Response(probe.stderr).text(),
    probe.exited,
  ]);
  expect(errors).toBe("");
  expect(exitCode).toBe(0);
  const observed = JSON.parse(output);
  expect(observed.providerResolved).toBe(true);
  expect(observed.validationStatus).toBe(400);
  expect(observed.validStatus).toBe(201);
  expect(observed.invalidPayloadReachedHandler).toBe(false);
  expect(observed.openApiPropertyType).toBe("string");
  expect(observed.openApiRequired).toEqual(["name"]);
  const workspace = await mkdtemp(join(tmpdir(), "insta-kubb-"));
  try {
    const generated = await build({
      config: {
        input: { data: observed.openApiDocument },
        output: { path: join(workspace, "generated"), barrelType: false },
        plugins: [pluginOas(), pluginTs()],
      },
    });
    expect(generated.failedPlugins.size).toBe(0);
    expect(generated.error).toBeUndefined();
    expect([...generated.sources.values()].join("\n")).toContain(
      "name: string",
    );
    expect(
      await Bun.file(
        join(workspace, "generated/types/CreateCompatibilityProbe.ts"),
      ).text(),
    ).toContain("name: string");
    expect(
      await Bun.file(
        new URL(
          "../../generated/types/CreateCompatibilityProbe.ts",
          import.meta.url,
        ),
      ).exists(),
    ).toBe(false);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
