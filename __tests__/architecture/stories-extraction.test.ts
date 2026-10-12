import { expect, test } from "bun:test";
import { cpSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import * as server from "../../apps/be-insta/src/domains/stories/index";
import * as browser from "../../apps/fe-insta/src/domains/stories/browser/state/index";
import { exerciseStories } from "./extraction/stories-behavior";
import { run } from "./fixtures/command";
import { repository } from "./fixtures/repository";

test("public Stories publish/feed/expiry and private frontend cleanup contracts", () =>
  exerciseStories({ server, browser }));
test("copied Stories preserve behavior; packed installed Kit imports recorder during SSR and rejects server code in browser", async () => {
  using host = repository({ "package.json": '{"type":"module"}' });
  symlinkSync(resolve("node_modules"), join(host.path, "node_modules"));
  const escaped: string[] = [];
  for (const [kind, source, entry] of [
    ["server", "apps/be-insta/src/domains/stories", "index.ts"],
    ["browser", "apps/fe-insta/src/domains/stories", "browser/state/index.ts"],
    ["recorder", "packages/media-recorder", "src/index.ts"],
  ] as const) {
    const owner = join(host.path, kind);
    cpSync(resolve(source), owner, { recursive: true });
    const built = await Bun.build({
      entrypoints: [join(owner, entry)],
      target: kind === "server" ? "bun" : "browser",
      naming: `${kind}.js`,
      outdir: host.path,
      plugins: [
        {
          name: "isolated-owner",
          setup: (build) => {
            build.onResolve({ filter: /^\./ }, (args) => {
              if (
                args.importer.startsWith(owner) &&
                !resolve(dirname(args.importer), args.path).startsWith(
                  `${owner}/`,
                )
              )
                escaped.push(args.path);
              return undefined;
            });
          },
        },
      ],
    });
    expect(built.success, built.logs.map(String).join("\n")).toBe(true);
  }
  expect(escaped).toEqual([]);
  cpSync(
    resolve("__tests__/architecture/extraction/stories-behavior.ts"),
    join(host.path, "behavior.ts"),
  );
  writeFileSync(
    join(host.path, "behavior.test.ts"),
    'import { test } from "bun:test"; import * as server from "./server.js"; import * as browser from "./browser.js"; import { exerciseStories } from "./behavior.ts"; test("isolated Stories", () => exerciseStories({server,browser}));',
  );
  const behavior = run(host.path, ["test", "behavior.test.ts"]);
  expect(behavior.exitCode, behavior.output).toBe(0);
  writeFileSync(
    join(host.path, "package.json"),
    JSON.stringify({
      name: "@fixture/stories",
      version: "0.0.0",
      type: "module",
      exports: {
        "./browser": "./browser.js",
        "./server": "./entry.server.js",
        "./recorder": "./recorder.js",
      },
      files: ["browser.js", "server.js", "entry.server.js", "recorder.js"],
    }),
  );
  writeFileSync(
    join(host.path, "entry.server.js"),
    'import "$app/server"; export { publishStory } from "./server.js";',
  );
  const packed = run(host.path, [
    "pm",
    "pack",
    "--filename",
    join(host.path, "stories.tgz"),
    "--ignore-scripts",
  ]);
  expect(packed.exitCode, packed.output).toBe(0);
  using kit = repository({
    "package.json": JSON.stringify({
      name: "stories-host",
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
      'import { defineConfig } from "vite"; import { sveltekit } from "@sveltejs/kit/vite"; import adapter from "@sveltejs/adapter-bun"; export default defineConfig({ ssr:{noExternal:["@fixture/stories"]}, plugins:[sveltekit({adapter:adapter({out:"dist"})})] });',
    "src/app.html": readFileSync(resolve("apps/fe-insta/src/app.html"), "utf8"),
    "src/routes/+page.server.js":
      'import { publishStory } from "@fixture/stories/server"; import { createRecorder } from "@fixture/stories/recorder"; export const load=()=>({ready:typeof publishStory==="function" && typeof createRecorder==="function"});',
    "src/routes/+page.svelte":
      '<script>import {createStoryPreview} from "@fixture/stories/browser"; import {createRecorder} from "@fixture/stories/recorder"; const preview=createStoryPreview();</script><p>{typeof createRecorder}:{typeof preview.dispose}</p>',
  });
  const installed = run(kit.path, ["add", join(host.path, "stories.tgz")]);
  expect(installed.exitCode, installed.output).toBe(0);
  const allowed = run(kit.path, ["--bun", "vite", "build"]);
  expect(allowed.exitCode, allowed.output).toBe(0);
  writeFileSync(
    join(kit.path, "src/routes/+page.svelte"),
    '<script>import {publishStory} from "@fixture/stories/server";</script><p>{typeof publishStory}</p>',
  );
  const rejected = run(kit.path, ["--bun", "vite", "build"]);
  expect(rejected.exitCode, rejected.output).not.toBe(0);
  expect(rejected.output).toContain("Cannot import");
  expect(rejected.output).toContain("$app/server");
}, 120000);
