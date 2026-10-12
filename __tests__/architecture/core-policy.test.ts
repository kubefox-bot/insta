import { expect, it } from "bun:test";
import { dirname, relative, resolve } from "node:path";
import { runModuleBoundariesCheck } from "@insta/fe-core/lints";
import { repository } from "./fixtures/repository.ts";

const cli = resolve(import.meta.dir, "../../packages/fe-core/src/cli.ts");
const configuration = await Bun.file(
  resolve(
    import.meta.dir,
    "../../packages/fe-core/module-boundaries.config.json",
  ),
).json();
for (const [source, target] of [
  ["api-boundaries/check.ts", "architecture/private.ts"],
  ["api-boundaries/check.ts", "presets/private.ts"],
  ["lib/source-analysis/read.ts", "architecture/private.ts"],
  ["lib/source-analysis/read.ts", "api-boundaries/private.ts"],
  ["architecture/read.ts", "api-boundaries/private.ts"],
  ["presets/definition.ts", "architecture/private.ts"],
  ["presets/definition.ts", "api-boundaries/private.ts"],
]) {
  it(`preserves real core forbidden edge ${source} → ${target}`, async () => {
    const owner = "packages/fe-core/src/";
    using fixture = repository({
      [`${owner}${source}`]: `import "${relative(dirname(source), target)}";`,
      [`${owner}${target}`]: "export const value = 1;",
      "module-boundaries.config.json": JSON.stringify(configuration),
    });
    expect(
      (
        await runModuleBoundariesCheck(configuration, { cwd: fixture.path })
      ).findings.map((value) => value.rule),
    ).toContain("layer-dependency");
    const result = Bun.spawnSync(
      [
        process.execPath,
        cli,
        "module-boundaries",
        "--config",
        "module-boundaries.config.json",
      ],
      { cwd: fixture.path },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("layer-dependency");
  });
}
it("allows existing architecture→presets and shared source-analysis public API", async () => {
  using fixture = repository({
    "packages/fe-core/src/architecture/read.ts":
      'import "../presets/definition.ts"; import "../lib/source-analysis/index.ts";',
    "packages/fe-core/src/api-boundaries/read.ts":
      'import "../lib/source-analysis/index.ts";',
    "packages/fe-core/src/presets/definition.ts": "export const value = 1;",
    "packages/fe-core/src/lib/source-analysis/index.ts":
      'export { value } from "./project.ts";',
    "packages/fe-core/src/lib/source-analysis/project.ts":
      "export const value = 1;",
  });
  expect(
    (await runModuleBoundariesCheck(configuration, { cwd: fixture.path }))
      .findings,
  ).toEqual([]);
});

it("rejects a consumer deep import into common source-analysis implementation", async () => {
  using fixture = repository({
    "packages/fe-core/src/api-boundaries/read.ts":
      'import "../lib/source-analysis/project.ts";',
    "packages/fe-core/src/lib/source-analysis/project.ts":
      "export const value = 1;",
  });
  expect(
    (
      await runModuleBoundariesCheck(configuration, { cwd: fixture.path })
    ).findings.map((value) => value.rule),
  ).toContain("private-module-import");
});
it("root lint:boundaries actually enrolls and runs the restored core policy", async () => {
  const root = resolve(import.meta.dir, "../..");
  const manifest = await Bun.file(resolve(root, "package.json")).json();
  using fixture = repository({
    "package.json": JSON.stringify({
      scripts: { "lint:boundaries": manifest.scripts["lint:boundaries"] },
    }),
    "module-boundaries.config.json": await Bun.file(
      resolve(root, "module-boundaries.config.json"),
    ).text(),
    "packages/fe-core/module-boundaries.config.json":
      JSON.stringify(configuration),
    "packages/fe-core/src/cli.ts": `import ${JSON.stringify(cli)};`,
    "packages/fe-core/src/api-boundaries/read.ts":
      'import "../architecture/private.ts";',
    "packages/fe-core/src/architecture/private.ts": "export const value = 1;",
  });
  const result = Bun.spawnSync([process.execPath, "run", "lint:boundaries"], {
    cwd: fixture.path,
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain("layer-dependency");
  expect(result.stderr.toString()).toContain(
    "packages/fe-core/module-boundaries.config.json",
  );
});
