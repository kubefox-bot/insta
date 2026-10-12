import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { repository } from "../architecture/fixtures/repository";

const run = (cwd: string, args: readonly string[]) => {
  const result = Bun.spawnSync([process.execPath, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60000,
  });
  return {
    exit: result.exitCode,
    out: result.stdout.toString() + result.stderr.toString(),
  };
};
test("packed real generated SDK passes SSR and fails browser build; portable contracts bundle alone", async () => {
  using fixture = repository({
    "package.json": JSON.stringify({
      name: "sdk-boundary-consumer",
      private: true,
      type: "module",
      devDependencies: {
        "@sveltejs/kit": "3.0.1",
        "@sveltejs/vite-plugin-svelte": "7.3.1",
        "@sveltejs/adapter-bun": "1.0.0",
        svelte: "5.57.2",
        vite: "8.3.3",
        ky: "2.1.0",
        zod: "4.6.5",
      },
    }),
    "producer/package.json": JSON.stringify({
      name: "@fixture/sdk",
      version: "0.0.0",
      type: "module",
      exports: { "./server": "./index.server.js" },
      files: ["index.server.js"],
    }),
    "producer/entry.ts": `export {getHealthReady} from "${resolve(import.meta.dir, "../../apps/fe-insta/src/lib/api/generated/clients/getHealthReady.ts")}";`,
    "vite.config.js":
      'import {defineConfig} from "vite"; import {sveltekit} from "@sveltejs/kit/vite"; import adapter from "@sveltejs/adapter-bun";export default defineConfig({ssr:{noExternal:["@fixture/sdk"]},plugins:[sveltekit({adapter:adapter({out:"dist"})})]});',
    "src/app.html": readFileSync(
      resolve(import.meta.dir, "../../apps/fe-insta/src/app.html"),
      "utf8",
    ),
    "src/routes/+page.server.js":
      'import {getHealthReady} from "@fixture/sdk/server";export const load=()=>({available:typeof getHealthReady==="function"});',
    "src/routes/+page.svelte": "<p>SDK fixture</p>",
  });
  const built = await Bun.build({
    entrypoints: [join(fixture.path, "producer/entry.ts")],
    target: "browser",
    // Bun1.4 browser bundles need glob matching to preserve this builtin;
    // an exact node:crypto entry incorrectly selects Bun's browser polyfill.
    external: ["$app/server", "ky", "zod", "node:crypto*"],
    outdir: join(fixture.path, "producer"),
    naming: "index.server.js",
  });
  expect(built.success, built.logs.join("\n")).toBe(true);
  const pack = run(join(fixture.path, "producer"), [
    "pm",
    "pack",
    "--filename",
    join(fixture.path, "sdk.tgz"),
    "--ignore-scripts",
  ]);
  expect(pack.exit, pack.out).toBe(0);
  const install = run(fixture.path, ["add", "./sdk.tgz"]);
  expect(install.exit, install.out).toBe(0);
  const ssr = run(fixture.path, ["--bun", "vite", "build"]);
  expect(ssr.exit, ssr.out).toBe(0);
  writeFileSync(
    join(fixture.path, "src/routes/+page.svelte"),
    '<script>import {getHealthReady} from "@fixture/sdk/server";</script><p>{typeof getHealthReady}</p>',
  );
  const browser = run(fixture.path, ["--bun", "vite", "build"]);
  expect(browser.exit, browser.out).not.toBe(0);
  expect(browser.out).toContain("Cannot import");
  expect(browser.out).toContain("$app/server");
  const portable = await Bun.build({
    entrypoints: [
      resolve(
        import.meta.dir,
        "../../packages/contracts/src/realtime/index.ts",
      ),
    ],
    target: "browser",
  });
  expect(portable.success).toBe(true);
  const code = await portable.outputs[0]?.text();
  expect(code).not.toContain("$app/server");
  expect(code).not.toContain("API_BASE_URL");
  expect(code).not.toContain("ky");
}, 120000);
