import { expect, test } from "bun:test";
import { cpSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import * as serverApi from "../../apps/be-insta/src/domains/conversations/index";
import * as browserApi from "../../apps/fe-insta/src/domains/conversations/browser/state/index";
import { exerciseConversations } from "./extraction/behavior";
import { run } from "./fixtures/command";
import { repository } from "./fixtures/repository";

test("Conversations uses injected ports and isolates view lifecycle through its public APIs", () =>
  exerciseConversations({ server: serverApi, browser: browserApi }));

test("copied Conversations builds outside the host and reuses public behavioral contracts without app/private-domain imports", async () => {
  using host = repository({ "package.json": '{"type":"module"}' });
  const sources = {
    browser: "apps/fe-insta/src/domains/conversations",
    server: "apps/be-insta/src/domains/conversations",
  };
  const forbiddenHostImports: string[] = [];
  symlinkSync(resolve("node_modules"), join(host.path, "node_modules"));
  for (const [kind, source] of Object.entries(sources)) {
    const owner = join(host.path, kind);
    cpSync(resolve(source), owner, { recursive: true });
    const result = await Bun.build({
      entrypoints: [
        join(owner, kind === "browser" ? "browser/state/index.ts" : "index.ts"),
      ],
      target: kind === "browser" ? "browser" : "bun",
      naming: `${kind}.js`,
      outdir: host.path,
      plugins: [
        {
          name: "owned-imports",
          setup: (build) => {
            build.onResolve({ filter: /^\./ }, (args) => {
              if (
                args.importer.startsWith(owner) &&
                !resolve(dirname(args.importer), args.path).startsWith(
                  `${owner}/`,
                )
              )
                forbiddenHostImports.push(args.path);
              return undefined;
            });
          },
        },
      ],
    });
    expect(result.success, result.logs.map(String).join("\n")).toBe(true);
  }
  expect(forbiddenHostImports).toEqual([]);
  cpSync(
    resolve("__tests__/architecture/extraction/behavior.ts"),
    join(host.path, "behavior.ts"),
  );
  writeFileSync(
    join(host.path, "behavior.test.ts"),
    'import { test } from "bun:test"; import * as server from "./server.js"; import * as browser from "./browser.js"; import { exerciseConversations } from "./behavior.ts"; test("extracted contracts", () => exerciseConversations({ server, browser }));',
  );
  const child = Bun.spawn([process.execPath, "test", "behavior.test.ts"], {
    cwd: host.path,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, out, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(code, out + error).toBe(0);
  writeFileSync(
    join(host.path, "package.json"),
    JSON.stringify({
      name: "@fixture/conversations",
      version: "0.0.0",
      type: "module",
      exports: { "./browser": "./browser.js", "./server": "./entry.server.js" },
      files: ["browser.js", "server.js", "entry.server.js"],
    }),
  );
  writeFileSync(
    join(host.path, "entry.server.js"),
    'import "$app/server"; export { startConversation } from "./server.js";',
  );
  const packed = run(host.path, [
    "pm",
    "pack",
    "--filename",
    join(host.path, "conversations.tgz"),
    "--ignore-scripts",
  ]);
  expect(packed.exitCode, packed.output).toBe(0);
  using kit = repository({
    "package.json": JSON.stringify({
      name: "extracted-host",
      private: true,
      type: "module",
      devDependencies: {
        "@sveltejs/kit": "3.0.1",
        "@sveltejs/vite-plugin-svelte": "7.3.1",
        "@sveltejs/adapter-bun": "1.0.0",
        svelte: "5.57.2",
        vite: "8.3.3",
      },
    }),
    "vite.config.js":
      'import { defineConfig } from "vite"; import { sveltekit } from "@sveltejs/kit/vite"; import adapter from "@sveltejs/adapter-bun"; export default defineConfig({ ssr: { noExternal: ["@fixture/conversations"] }, plugins: [sveltekit({ adapter: adapter({ out: "dist" }) })] });',
    "src/app.html": readFileSync(resolve("apps/fe-insta/src/app.html"), "utf8"),
    "src/routes/+page.server.js":
      'import { startConversation } from "@fixture/conversations/server"; export const load = () => ({ approved: typeof startConversation === "function" });',
    "src/routes/+page.svelte":
      '<script>import { createConversationStore } from "@fixture/conversations/browser"; const store = createConversationStore({ initial: [], actor: null }); const view = store.view;</script><p>{$view.conversations.length}</p>',
  });
  const installed = run(kit.path, [
    "add",
    join(host.path, "conversations.tgz"),
  ]);
  expect(installed.exitCode, installed.output).toBe(0);
  const allowed = run(kit.path, ["--bun", "vite", "build"]);
  expect(allowed.exitCode, allowed.output).toBe(0);
  writeFileSync(
    join(kit.path, "src/routes/+page.svelte"),
    '<script>import { startConversation } from "@fixture/conversations/server";</script><p>{typeof startConversation}</p>',
  );
  const rejected = run(kit.path, ["--bun", "vite", "build"]);
  expect(rejected.exitCode, rejected.output).not.toBe(0);
  expect(rejected.output).toContain("Cannot import");
  expect(rejected.output).toContain("$app/server");
}, 120000);
