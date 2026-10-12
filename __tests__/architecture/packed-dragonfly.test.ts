import { expect, it } from "bun:test";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { run } from "./fixtures/command";
import { repository } from "./fixtures/repository.ts";

it("packs the actual Dragonfly public export; server build passes and browser build rejects", () => {
  using fixture = repository({
    "package.json": JSON.stringify({
      name: "packed-boundary-consumer",
      private: true,
      type: "module",
      devDependencies: {
        "@sveltejs/kit": "3.0.1",
        "@sveltejs/vite-plugin-svelte": "7.3.1",
        "@sveltejs/adapter-bun": "1.0.0",
        svelte: "5.57.2",
        vite: "8.3.3",
        "svelte-check": "4.7.6",
        typescript: "6.0.3",
        "@typescript/native-preview": "7.0.0-dev.20260707.2",
      },
    }),
    "producer/package.json": JSON.stringify({
      ...JSON.parse(
        readFileSync(
          resolve(import.meta.dir, "../../packages/fe-core/package.json"),
          "utf8",
        ),
      ),
      dependencies: {},
      devDependencies: {},
      files: ["src/dragonfly"],
    }),
    "vite.config.js":
      'import { defineConfig } from "vite"; import { sveltekit } from "@sveltejs/kit/vite"; import adapter from "@sveltejs/adapter-bun"; export default defineConfig({ ssr: { noExternal: ["@insta/fe-core"] }, plugins: [sveltekit({ adapter: adapter({ out: "dist" }) })] });',
    "tsconfig.json": JSON.stringify({ extends: "$app/tsconfig" }),
    "src/app.html": readFileSync(
      resolve(import.meta.dir, "../../apps/fe-insta/src/app.html"),
      "utf8",
    ),
    "src/routes/+page.server.js":
      'import { connectDragonfly } from "@insta/fe-core/dragonfly/server"; export const load = () => ({ approved: typeof connectDragonfly === "function" });',
    "src/routes/+page.svelte":
      '<script>import { Player } from "../browser/index.ts";</script><Player />',
    "src/browser/index.ts":
      'export { default as Player } from "../components/Player/index.svelte";',
    "src/components/Player/index.svelte":
      '<script>const title = "fixture";</script><p>{title}</p>',
  });
  cpSync(
    resolve(import.meta.dir, "../../packages/fe-core/src/dragonfly"),
    join(fixture.path, "producer/src/dragonfly"),
    { recursive: true },
  );
  const packed = run(join(fixture.path, "producer"), [
    "pm",
    "pack",
    "--filename",
    join(fixture.path, "server.tgz"),
    "--ignore-scripts",
  ]);
  expect(packed.exitCode, packed.output).toBe(0);
  const installed = run(fixture.path, ["add", "./server.tgz"]);
  expect(installed.exitCode, installed.output).toBe(0);
  const installedCode = readFileSync(
    join(
      fixture.path,
      "node_modules/@insta/fe-core/src/dragonfly/server/unavailable.js",
    ),
    "utf8",
  );
  expect(installedCode).toContain("$app/server");
  const sync = run(fixture.path, ["--bun", "svelte-kit", "sync"]);
  expect(sync.exitCode, sync.output).toBe(0);
  const checked = run(fixture.path, [
    "--bun",
    "svelte-check",
    "--tsgo",
    "--tsconfig",
    "./tsconfig.json",
  ]);
  expect(checked.exitCode, checked.output).toBe(0);
  const allowed = run(fixture.path, ["--bun", "vite", "build"]);
  expect(allowed.exitCode, allowed.output).toBe(0);
  writeFileSync(
    join(fixture.path, "src/routes/+page.svelte"),
    '<script>import { connectDragonfly } from "@insta/fe-core/dragonfly/server";</script><p>{typeof connectDragonfly}</p>',
  );
  const rejected = run(fixture.path, ["--bun", "vite", "build"]);
  expect(rejected.exitCode, rejected.output).not.toBe(0);
  expect(rejected.output).toContain("$app/server");
  expect(rejected.output).toContain(
    "@insta/fe-core/src/dragonfly/server/unavailable.js",
  );
  expect(rejected.output).toContain("Cannot import");
  // Проверяем установленный export: отказ обязан исходить от Kit server guard.
}, 120000);
