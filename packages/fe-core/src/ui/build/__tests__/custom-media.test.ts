import { expect, test } from "bun:test";
import { repository } from "../../../../../../__tests__/architecture/fixtures/repository";

test("compiles custom media independently for each CSS Module in minified production output", async () => {
  const { createUiMediaPlugin } = await import("../index.ts");
  const { build } = await import("vite");
  using fixture = repository({
    "index.html": '<script type="module" src="/main.ts"></script>',
    "main.ts":
      'import first from "./first.module.css"; import second from "./second.module.css"; document.body.className = first.compact + " " + second.split;',
    "first.module.css": "@media (--ui-compact) { .compact { color: red; } }",
    "second.module.css": "@media (--ui-split) { .split { color: blue; } }",
  });
  const output = await build({
    root: fixture.path,
    configFile: false,
    plugins: [createUiMediaPlugin()],
    css: { transformer: "lightningcss" },
    build: { write: false, cssMinify: "lightningcss" },
    logLevel: "error",
  });
  const bundles = Array.isArray(output) ? output : [output];
  const css = bundles
    .flatMap((bundle) => {
      if (!("output" in bundle))
        throw new Error("Expected completed build, received watcher");
      return bundle.output;
    })
    .flatMap((asset) =>
      asset.type === "asset" && asset.fileName.endsWith(".css")
        ? [String(asset.source)]
        : [],
    )
    .join("\n");
  expect(css).toContain("@media (width<48rem)");
  expect(css).toContain("@media (width>=48rem)");
  expect(css).toContain("color:red");
  expect(css).toContain("color:#00f");
  expect(css).not.toContain("--ui-compact");
  expect(css).not.toContain("--ui-split");
  expect(css).not.toContain("@custom-media");
});

test("rejects an unsupported CSS transformer before emitting unresolved custom media", async () => {
  const { createUiMediaPlugin } = await import("../index.ts");
  const { build } = await import("vite");
  using fixture = repository({
    "index.html": '<script type="module" src="/main.ts"></script>',
    "main.ts": 'import "./first.module.css";',
    "first.module.css": "@media (--ui-compact) { .compact { color: red; } }",
  });
  await expect(
    build({
      root: fixture.path,
      configFile: false,
      plugins: [createUiMediaPlugin()],
      build: { write: false },
      logLevel: "error",
    }),
  ).rejects.toThrow("UI custom media requires the Lightning CSS transformer");
});
