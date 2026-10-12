import { expect, test } from "bun:test";
import { symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { runModuleBoundariesCheck } from "@insta/fe-core/lints";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { build, createServer } from "vite";
import { repository } from "../../../../__tests__/architecture/fixtures/repository";
import config from "../../../../module-boundaries.config.json";
import coreConfig from "../../../fe-core/module-boundaries.config.json";

const base = {
  "packages/fe-core/package.json": JSON.stringify({
    name: "@insta/fe-core",
    exports: {
      "./ui": "./src/ui/index.ts",
      "./ui/styles.css": "./src/ui/tokens/styles.css",
    },
  }),
  "packages/fe-core/src/ui/index.ts":
    'export { default as Button } from "./components/Button/index.svelte";',
  "packages/fe-core/src/ui/components/Button/index.svelte":
    "<button>Button</button>",
  "packages/fe-core/src/ui/tokens/styles.css": ":root { --surface: white; }",
  "packages/fe-core/src/ui/tokens/primitives/color.css":
    ":root { --private: red; }",
  "packages/ui-kit/package.json": JSON.stringify({
    name: "@insta/ui-kit",
    exports: {
      ".": "./src/index.ts",
      "./styles.css": "./src/tokens/styles.css",
    },
  }),
  "packages/ui-kit/src/index.ts":
    'export { default as Button } from "./components/Button/index.svelte";',
  "packages/ui-kit/src/components/Button/index.svelte":
    "<button>Button</button>",
  "packages/ui-kit/src/tokens/styles.css": ":root { --surface: white; }",
};
test("accepts the fe-core UI public component and CSS imports", async () => {
  using fixture = repository({
    ...base,
    "apps/fe-insta/src/routes/+page.svelte":
      '<script>import { Button } from "@insta/fe-core/ui"; import "@insta/fe-core/ui/styles.css";</script><Button />',
  });
  expect(
    (await runModuleBoundariesCheck(config, { cwd: fixture.path })).findings,
  ).toEqual([]);
});

test.each([
  "@insta/fe-core/src/ui/components/Button/index.svelte",
  "@insta/fe-core/src/ui/tokens/primitives/color.css",
])("rejects private new UI import %s", async (path) => {
  using fixture = repository({
    ...base,
    "apps/fe-insta/src/routes/+page.svelte": `<script>import "${path}";</script>`,
  });
  expect(
    (
      await runModuleBoundariesCheck(config, { cwd: fixture.path })
    ).findings.map((item) => item.rule),
  ).toContain("private-module-import");
});

test.each([
  ["ui/private.ts", "observability/server/index.ts"],
  ["ui/private.ts", "architecture/private.ts"],
  ["architecture/private.ts", "ui/index.ts"],
  ["observability/server/private.ts", "ui/index.ts"],
])("isolates core UI edge %s → %s", async (source, target) => {
  using fixture = repository({
    [`packages/fe-core/src/${source}`]: `import "${relative(dirname(source), target)}";`,
    [`packages/fe-core/src/${target}`]: "export const value = 1;",
  });
  expect(
    (
      await runModuleBoundariesCheck(coreConfig, { cwd: fixture.path })
    ).findings.map((item) => item.rule),
  ).toContain("layer-dependency");
});

test("both public packages resolve the same SSR components without tooling or server exports", async () => {
  const server = await createServer({
    root: new URL("../fixtures", import.meta.url).pathname,
    cacheDir: new URL(
      "../../../../.infra/ui/boundary-ssr-cache",
      import.meta.url,
    ).pathname,
    configFile: false,
    plugins: [svelte({ configFile: false })],
    css: { transformer: "lightningcss" },
    server: { host: "127.0.0.1", port: 0 },
    ssr: {
      noExternal: [
        "@insta/ui-kit",
        "@insta/fe-core",
        "bits-ui",
        "runed",
        "svelte-toolbelt",
      ],
    },
    logLevel: "error",
  });
  try {
    await server.listen();
    const current = await server.ssrLoadModule("@insta/fe-core/ui");
    const compatible = await server.ssrLoadModule("@insta/ui-kit");
    const icons = await server.ssrLoadModule("@insta/fe-core/ui/icons");
    for (const name of [
      "Button",
      "Input",
      "Textarea",
      "Dialog",
      "Menu",
      "Icon",
      "Avatar",
      "SearchIcon",
      "ClearIcon",
      "SendIcon",
      "BackIcon",
      "CloseIcon",
      "CameraIcon",
      "PlusIcon",
      "SettingsIcon",
      "ClockIcon",
      "CheckIcon",
      "DoubleCheckIcon",
      "ErrorIcon",
    ]) {
      expect(typeof current[name]).toBe("function");
      expect(compatible[name]).toBe(current[name]);
    }
    for (const name of Object.keys(icons))
      expect(icons[name]).toBe(current[name]);
    expect(Object.keys(current).sort()).toEqual([
      "Avatar",
      "BackIcon",
      "Button",
      "CameraIcon",
      "CheckIcon",
      "ClearIcon",
      "ClockIcon",
      "CloseIcon",
      "Dialog",
      "DoubleCheckIcon",
      "ErrorIcon",
      "Icon",
      "Indicator",
      "Input",
      "Menu",
      "PlusIcon",
      "SearchIcon",
      "SendIcon",
      "SettingsIcon",
      "Textarea",
    ]);
  } finally {
    await server.close();
  }
});

test.each([
  ["ui/private.ts", "index.ts"],
  ["ui/private.ts", "cli.ts"],
  ["index.ts", "ui/index.ts"],
  ["cli.ts", "ui/index.ts"],
])("isolates tooling entrypoint edge %s → %s", async (source, target) => {
  using fixture = repository({
    [`packages/fe-core/src/${source}`]: `import "./${relative(dirname(source), target)}";`,
    [`packages/fe-core/src/${target}`]: "export const value = 1;",
  });
  expect(
    (
      await runModuleBoundariesCheck(coreConfig, { cwd: fixture.path })
    ).findings.map((item) => item.rule),
  ).toContain("forbidden-dependency");
});

test("compatibility and current public stylesheet compile to the same single token definitions", async () => {
  using fixture = repository({
    "package.json": '{"type":"module"}',
    "index.html": '<script type="module" src="/main.ts"></script>',
    "main.ts": 'import "@insta/fe-core/ui/styles.css";',
  });
  symlinkSync(
    resolve("apps/fe-insta/node_modules"),
    join(fixture.path, "node_modules"),
  );
  const compile = async () => {
    const output = await build({
      root: fixture.path,
      configFile: false,
      css: { transformer: "lightningcss" },
      build: { write: false, cssMinify: "lightningcss" },
      logLevel: "error",
    });
    const bundles = Array.isArray(output) ? output : [output];
    return bundles
      .flatMap((bundle) => {
        if (!("output" in bundle))
          throw new Error("Expected completed CSS build, received watcher");
        return bundle.output;
      })
      .flatMap((asset) =>
        asset.type === "asset" && asset.fileName.endsWith(".css")
          ? [String(asset.source)]
          : [],
      )
      .join("\n");
  };
  const current = await compile();
  expect(current.match(/--ui-surface-page:/g)).toHaveLength(1);
  writeFileSync(
    join(fixture.path, "main.ts"),
    'import "@insta/ui-kit/styles.css";',
  );
  expect(await compile()).toBe(current);
});
test("accepts root UI exports and token stylesheet from Svelte consumer", async () => {
  using fixture = repository({
    ...base,
    "apps/fe-insta/src/routes/+page.svelte":
      '<script>import { Button } from "@insta/ui-kit"; import "@insta/ui-kit/styles.css";</script><Button />',
  });
  expect(
    (await runModuleBoundariesCheck(config, { cwd: fixture.path })).findings,
  ).toEqual([]);
});
test("rejects private component deep-imports", async () => {
  using fixture = repository({
    ...base,
    "apps/fe-insta/src/routes/+page.svelte":
      '<script>import Button from "@insta/ui-kit/src/components/Button/index.svelte";</script><Button />',
  });
  expect(
    (
      await runModuleBoundariesCheck(config, { cwd: fixture.path })
    ).findings.map((item) => item.rule),
  ).toContain("private-module-import");
});
test("rejects UI package depending on application", async () => {
  using fixture = repository({
    ...base,
    "packages/ui-kit/src/application.ts":
      'import "../../../apps/fe-insta/src/app/example.ts";',
    "apps/fe-insta/src/app/example.ts": "export const example = 1;",
  });
  expect(
    (
      await runModuleBoundariesCheck(config, { cwd: fixture.path })
    ).findings.map((item) => item.rule),
  ).toContain("layer-dependency");
});

test("rejects private token deep-imports", async () => {
  using fixture = repository({
    ...base,
    "packages/ui-kit/src/tokens/primitives/color.css":
      ":root { --private: red; }",
    "apps/fe-insta/src/routes/+page.svelte":
      '<script>import "@insta/ui-kit/src/tokens/primitives/color.css";</script>',
  });
  expect(
    (
      await runModuleBoundariesCheck(config, { cwd: fixture.path })
    ).findings.map((item) => item.rule),
  ).toContain("private-module-import");
});

test("accepts public breakpoint queries and the build adapter at Vite composition", async () => {
  using fixture = repository({
    ...base,
    "packages/fe-core/package.json": JSON.stringify({
      name: "@insta/fe-core",
      exports: {
        "./ui/breakpoints": "./src/ui/tokens/breakpoints/index.ts",
        "./ui/build": "./src/ui/build/index.ts",
      },
    }),
    "packages/fe-core/src/ui/tokens/breakpoints/index.ts":
      'export const mediaQueries = {compact: "(width < 48rem)"};',
    "packages/fe-core/src/ui/build/index.ts":
      "export const createUiMediaPlugin = () => ({});",
    "apps/fe-insta/src/routes/+page.svelte":
      '<script>import { mediaQueries } from "@insta/fe-core/ui/breakpoints";</script>',
    "apps/fe-insta/vite.config.ts":
      'import { createUiMediaPlugin } from "@insta/fe-core/ui/build";',
  });
  expect(
    (await runModuleBoundariesCheck(config, { cwd: fixture.path })).findings,
  ).toEqual([]);
});

test.each([
  "apps/fe-insta/src/routes/+page.svelte",
  "packages/ui-kit/src/private.ts",
])("rejects build-only UI adapter in browser consumer %s", async (source) => {
  using fixture = repository({
    ...base,
    "packages/fe-core/package.json": JSON.stringify({
      name: "@insta/fe-core",
      exports: { "./ui/build": "./src/ui/build/index.ts" },
    }),
    "packages/fe-core/src/ui/build/index.ts": "export const plugin = 1;",
    [source]: source.endsWith(".svelte")
      ? '<script>import "@insta/fe-core/ui/build";</script>'
      : 'import "@insta/fe-core/ui/build";',
  });
  expect(
    (
      await runModuleBoundariesCheck(config, { cwd: fixture.path })
    ).findings.map((finding) => finding.rule),
  ).toContain("forbidden-dependency");
});

test.each([
  "ui/index.ts",
  "ui/components/example.ts",
  "ui/tokens/example.ts",
  "ui/icons/example.ts",
])(
  "rejects build-only UI adapter from the core browser owner %s",
  async (source) => {
    using fixture = repository({
      [`packages/fe-core/src/${source}`]: `import "./${relative(dirname(source), "ui/build/index.ts")}";`,
      "packages/fe-core/src/ui/build/index.ts": "export const plugin = 1;",
    });
    expect(
      (
        await runModuleBoundariesCheck(coreConfig, { cwd: fixture.path })
      ).findings.map((finding) => finding.rule),
    ).toContain("forbidden-dependency");
  },
);

test("accepts the public icons subpath from Svelte consumers", async () => {
  using fixture = repository({
    ...base,
    "packages/fe-core/package.json": JSON.stringify({
      name: "@insta/fe-core",
      exports: { "./ui/icons": "./src/ui/icons/index.ts" },
    }),
    "packages/fe-core/src/ui/icons/index.ts":
      'export { default as SearchIcon } from "./actions/Search.svelte";',
    "packages/fe-core/src/ui/icons/actions/Search.svelte": "<svg></svg>",
    "apps/fe-insta/src/routes/+page.svelte":
      '<script>import { SearchIcon } from "@insta/fe-core/ui/icons";</script><SearchIcon />',
  });
  expect(
    (await runModuleBoundariesCheck(config, { cwd: fixture.path })).findings,
  ).toEqual([]);
});

test("rejects private icon and avatar implementations", async () => {
  for (const path of [
    "icons/actions/Search.svelte",
    "components/Avatar/index.svelte",
  ]) {
    using fixture = repository({
      ...base,
      [`packages/fe-core/src/ui/${path}`]: "<span></span>",
      "apps/fe-insta/src/routes/+page.svelte": `<script>import Atom from "@insta/fe-core/src/ui/${path}";</script><Atom />`,
    });
    expect(
      (
        await runModuleBoundariesCheck(config, { cwd: fixture.path })
      ).findings.map((finding) => finding.rule),
    ).toContain("private-module-import");
  }
});
