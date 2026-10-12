import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { repository } from "../architecture/fixtures/repository";

const run = async (cwd: string, args: readonly string[]) => {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60000,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, output: stdout + stderr };
};
test("actual packed fe-core browser bundle and Kit SSR work; installed server import fails client build", async () => {
  using fixture = repository({
    "package.json": JSON.stringify({
      name: "observability-packed-consumer",
      private: true,
      type: "module",
      devDependencies: {
        "@sveltejs/kit": "3.0.1",
        "@sveltejs/vite-plugin-svelte": "7.3.1",
        "@sveltejs/adapter-bun": "1.0.0",
        svelte: "5.57.2",
        typescript: "6.0.3",
        vite: "8.3.3",
      },
    }),
    "vite.config.js":
      'import { defineConfig } from "vite"; import { sveltekit } from "@sveltejs/kit/vite"; import adapter from "@sveltejs/adapter-bun"; export default defineConfig({ ssr: { noExternal: ["@insta/fe-core"] }, plugins: [sveltekit({ adapter: adapter({ out: "dist" }) })] });',
    "tsconfig.json": JSON.stringify({ extends: "$app/tsconfig" }),
    "src/app.html": readFileSync(
      resolve(import.meta.dir, "../../apps/fe-insta/src/app.html"),
      "utf8",
    ),
    "src/routes/+page.server.js":
      'import { withContext, readContext } from "@insta/fe-core/observability/server"; export const load = () => withContext({ context: {}, execute: () => ({ scoped: Boolean(readContext()) }) });',
    "src/routes/+page.svelte":
      '<script>import { createObservabilityService } from "@insta/fe-core/observability/browser"; const runtime = createObservabilityService({ identity: { app: "fixture", service_name: "fixture", source: "browser" }, clock: () => 0, uuid: crypto.randomUUID, context: () => ({}) });</script><p>{typeof runtime.operation}</p>',
    "entry.ts":
      'export { createBusinessObserver, createObservabilityService, createOtelBusinessMetricsAdapter } from "@insta/fe-core/observability/browser";',
  });
  const packed = await run(resolve(import.meta.dir, "../../packages/fe-core"), [
    "pm",
    "pack",
    "--filename",
    join(fixture.path, "core.tgz"),
    "--ignore-scripts",
  ]);
  expect(packed.code, packed.output).toBe(0);
  const installed = await run(fixture.path, ["add", "./core.tgz"]);
  expect(installed.code, installed.output).toBe(0);
  const portableSource = readFileSync(
    join(
      fixture.path,
      "node_modules/@insta/fe-core/src/observability/browser/index.ts",
    ),
    "utf8",
  );
  expect(portableSource).not.toContain("$app");
  const browser = await run(fixture.path, [
    "build",
    "entry.ts",
    "--target",
    "browser",
    "--outfile",
    "browser.js",
  ]);
  expect(browser.code, browser.output).toBe(0);
  const bundle = readFileSync(join(fixture.path, "browser.js"), "utf8");
  for (const forbidden of ["async_hooks", "nestjs-pino", "pino-adapter"])
    expect(bundle).not.toContain(forbidden);
  const sync = await run(fixture.path, ["--bun", "svelte-kit", "sync"]);
  expect(sync.code, sync.output).toBe(0);
  const positive = await run(fixture.path, ["--bun", "vite", "build"]);
  expect(positive.code, positive.output).toBe(0);
  writeFileSync(
    join(fixture.path, "src/routes/+page.svelte"),
    '<script>import { withContext } from "@insta/fe-core/observability/server";</script><p>{withContext({ context: {}, execute: () => "invalid browser" })}</p>',
  );
  const negative = await run(fixture.path, ["--bun", "vite", "build"]);
  expect(negative.code, negative.output).not.toBe(0);
  expect(negative.output).toContain("MISSING_EXPORT");
  expect(negative.output).toContain("server-unavailable.ts");
}, 120000);
