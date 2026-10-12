import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { runModuleBoundariesCheck } from "../src/architecture/module-boundaries/check.ts";
import { createFixtureRepository } from "./fixture-repository.ts";

const cliPath = resolve(import.meta.dir, "../src/cli.ts");
const config = {
  sourceRoot: "src",
  layers: [
    { name: "routes", root: "src/routes", allow: ["business", "infra"] },
    { name: "business", root: "src/business", allow: ["infra"] },
    { name: "infra", root: "src/infra", allow: [] },
  ],
  moduleGroups: [
    {
      root: "src/business",
      publicEntrypoints: ["server/index.ts", "model/index.ts"],
      forbidCycles: true,
    },
  ],
};
const baseFiles = {
  "boundaries.json": JSON.stringify(config),
  "tsconfig.json": JSON.stringify({
    compilerOptions: {
      module: "ESNext",
      moduleResolution: "Bundler",
      target: "ES2022",
      paths: { "@/*": ["./src/*"] },
    },
    include: ["src/**/*"],
  }),
  "src/business/lessons/server/index.ts":
    'export { readLesson } from "./read";',
  "src/business/lessons/server/read.ts": "export const readLesson = () => 1;",
  "src/business/learning/server/index.ts":
    'export { progress } from "./progress";',
  "src/business/learning/server/progress.ts": "export const progress = 1;",
  "src/infra/config.ts": "export const config = {};",
};
const run = async (
  files: Record<string, string>,
  options: Record<string, unknown> = config,
) => {
  using fixture = createFixtureRepository({
    ...baseFiles,
    ...files,
    "boundaries.json": JSON.stringify(options),
  });
  const child = Bun.spawn(
    [
      process.execPath,
      cliPath,
      "module-boundaries",
      "--config",
      "boundaries.json",
    ],
    {
      cwd: fixture.path,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
};

describe("module boundaries CLI", () => {
  it("allows public entrypoints and direct implementation imports inside the owner", async () => {
    const result = await run({
      "src/routes/page.ts":
        'import { readLesson } from "@/business/lessons/server"; import { config } from "../infra/config";',
      "src/business/learning/server/progress.ts":
        'import { readLesson } from "@/business/lessons/server"; export const progress = readLesson();',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("blocks private imports from other modules with the source and target", async () => {
    const result = await run({
      "src/business/learning/server/progress.ts":
        'import { readLesson } from "@/business/lessons/server/read";',
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("private-module-import");
    expect(result.stderr).toContain("src/business/learning/server/progress.ts");
    expect(result.stderr).toContain("src/business/lessons/server/read.ts");
  });

  it("does not treat an arbitrary nested index as a public entrypoint", async () => {
    const result = await run({
      "src/business/lessons/server/repository/index.ts":
        "export const repository = {};",
      "src/routes/page.ts":
        'import { repository } from "@/business/lessons/server/repository";',
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("private-module-import");
  });

  it("blocks reverse layer dependencies including type-only re-exports", async () => {
    const result = await run({
      "src/business/lessons/model/index.ts":
        "export type Lesson = { id: number };",
      "src/infra/contracts.ts":
        'export type { Lesson } from "@/business/lessons/model";',
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("layer-dependency");
  });

  it("blocks layer bypasses through files outside configured layers", async () => {
    const result = await run({
      "src/bridge.ts":
        'export { readLesson } from "@/business/lessons/server";',
      "src/infra/request.ts": 'import { readLesson } from "../bridge";',
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("layer-dependency");
    expect(result.stderr).toContain("src/bridge.ts");
  });

  it("detects domain cycles through public entrypoints", async () => {
    const result = await run({
      "src/business/learning/server/progress.ts":
        'import { readLesson } from "@/business/lessons/server"; export const progress = 1;',
      "src/business/lessons/server/read.ts":
        'import { progress } from "@/business/learning/server"; export const readLesson = () => progress;',
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("module-cycle");
    expect(result.stderr).toContain("learning");
    expect(result.stderr).toContain("lessons");
  });

  it("detects cycles passing through an unowned bridge", async () => {
    const result = await run({
      "src/business/learning/server/progress.ts":
        'export { readLesson as progress } from "../../../bridge";',
      "src/bridge.ts":
        'export { readLesson } from "@/business/lessons/server";',
      "src/business/lessons/server/read.ts":
        'export { progress as readLesson } from "@/business/learning/server";',
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("module-cycle");
  });

  it("checks literal dynamic imports and require calls", async () => {
    for (const source of [
      'const pending = import("@/business/lessons/server/read");',
      'const pending = require("@/business/lessons/server/read");',
      'type Lesson = import("@/business/lessons/server/read");',
    ]) {
      const result = await run({ "src/routes/page.ts": source });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("private-module-import");
    }
  });

  it("fails closed for computed dynamic imports and unresolved local aliases", async () => {
    for (const source of [
      'const target = "@/business/lessons/server"; const pending = import(target);',
      'import { missing } from "@/business/lessons/missing";',
    ]) {
      const result = await run({ "src/routes/page.ts": source });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(
        /dynamic-module-import|unresolved-local-import/,
      );
    }
  });

  it("ignores tests for the production graph and permits external packages", async () => {
    const result = await run({
      "src/infra/request.ts": 'import { readFile } from "node:fs/promises";',
      "src/infra/__tests__/request.test.ts":
        'import { readLesson } from "@/business/lessons/server/read";',
    });
    expect(result.exitCode).toBe(0);
  });

  it("rejects invalid owners, overlapping layers and unknown configuration fields", async () => {
    for (const value of [
      { ...config, layers: [{ name: "bad", root: "../outside", allow: [] }] },
      {
        ...config,
        layers: [
          ...config.layers,
          { name: "nested", root: "src/business/lessons", allow: [] },
        ],
      },
      {
        ...config,
        layers: [{ name: "infra", root: "src/infra", allow: ["missing"] }],
      },
      {
        ...config,
        moduleGroups: [
          { ...config.moduleGroups[0], publicEntrypoints: ["../private.ts"] },
        ],
      },
      { ...config, mode: "warn" },
    ]) {
      const result = await run({}, value);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("конфигураци");
    }
  });
});

it("accepts existing resources and rejects missing resource imports", async () => {
  const valid = await run({
    "src/routes/page.ts": 'import "./page.module.css";',
    "src/routes/page.module.css": ".page {}",
  });
  expect(valid.exitCode).toBe(0);
  const missing = await run({
    "src/routes/page.ts": 'import "./missing.css";',
  });
  expect(missing.exitCode).toBe(1);
  expect(missing.stderr).toContain("unresolved-local-import");
});
it("counts type-only module cycles", async () => {
  const result = await run({
    "src/business/lessons/model/index.ts":
      'export type { Progress } from "@/business/learning/model";',
    "src/business/learning/model/index.ts":
      'export type { Lesson } from "@/business/lessons/model";',
  });
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("module-cycle");
});

it("rejects executable bridges outside the analyzed production graph", async () => {
  for (const bridge of ["bridge.ts", "src/bridge.js", "src/bridge.test.ts"]) {
    const result = await run({
      [bridge]: 'export { readLesson } from "@/business/lessons/server";',
      "src/infra/request.ts": `import { readLesson } from "${bridge.startsWith("src/") ? `../${bridge.slice(4)}` : `../../${bridge}`}";`,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("unanalyzed-local-import");
    expect(result.stderr).toContain(bridge);
  }
});
const checkAliases = async ({
  paths,
  specifier = "@business/lessons/server",
  files = {},
}: Readonly<{
  paths: Record<string, string[]>;
  specifier?: string;
  files?: Record<string, string>;
}>) => {
  using fixture = createFixtureRepository({
    ...baseFiles,
    "tsconfig.json": JSON.stringify({
      compilerOptions: { module: "ESNext", moduleResolution: "Bundler", paths },
      include: ["src/**/*"],
    }),
    "src/infra/request.ts": `import { readLesson } from "${specifier}";`,
    ...files,
  });
  return await runModuleBoundariesCheck(config, { cwd: fixture.path });
};
it("resolves exact and longest-prefix aliases before broad patterns", async () => {
  const aliases: Record<string, string[]>[] = [
    { "*": ["./src/infra/config.ts"], "@business/*": ["./src/business/*"] },
    {
      "@business/*": ["./src/infra/config.ts"],
      "@business/lessons/server": ["./src/business/lessons/server/index.ts"],
    },
  ];
  for (const paths of aliases) {
    const result = await checkAliases({ paths });
    expect(
      result.findings.some((finding) => finding.rule === "layer-dependency"),
    ).toBe(true);
  }
});
it("does not fall back to a less specific matching alias", async () => {
  const result = await checkAliases({
    paths: {
      "*": ["./src/infra/config.ts"],
      "@business/*": ["./missing/*"],
    },
  });
  expect(
    result.findings.some(
      (finding) => finding.rule === "unresolved-local-import",
    ),
  ).toBe(true);
});

it("treats exact canonical external public package aliases as external", async () => {
  for (const specifier of ["vendor", "@vendor/boxed"]) {
    const result = await checkAliases({
      specifier,
      paths: { [specifier]: [`./node_modules/${specifier}`] },
    });
    expect(result.findings).toEqual([]);
  }
});

it("rejects deep, different-package, relative and mixed unresolved aliases", async () => {
  for (const { specifier, targets } of [
    {
      specifier: "@vendor/boxed/private",
      targets: ["./node_modules/@vendor/boxed/private"],
    },
    {
      specifier: "@vendor/boxed",
      targets: ["./node_modules/@vendor/boxed/private"],
    },
    { specifier: "@vendor/boxed", targets: ["./node_modules/@other/boxed"] },
    {
      specifier: "@vendor/boxed",
      targets: ["./node_modules/@vendor/boxed", "./missing.ts"],
    },
    { specifier: "../../node_modules/vendor", targets: [] },
  ]) {
    const result = await checkAliases({
      specifier,
      paths: { [specifier]: targets },
    });
    expect(
      result.findings.some(
        (finding) => finding.rule === "unresolved-local-import",
      ),
    ).toBe(true);
  }
});

it("keeps local and mixed private source aliases in the checked graph", async () => {
  for (const targets of [
    ["./src/business/lessons/server/read.ts"],
    ["./node_modules/@vendor/boxed", "./src/business/lessons/server/read.ts"],
  ]) {
    const result = await checkAliases({
      specifier: "@vendor/boxed",
      paths: { "@vendor/boxed": targets },
    });
    expect(
      result.findings.some(
        (finding) => finding.rule === "private-module-import",
      ),
    ).toBe(true);
  }
});

it("checks real workspace public and private targets before external alias classification", async () => {
  for (const { specifier, target, rule } of [
    {
      specifier: "@owned/lessons",
      target: "./node_modules/@owned/lessons",
      rule: "layer-dependency",
    },
    {
      specifier: "@owned/lessons/server/read",
      target: "./node_modules/@owned/lessons/server/read",
      rule: "private-module-import",
    },
  ]) {
    const result = await checkAliases({
      specifier,
      paths: { [specifier]: [target] },
      files: {
        "src/business/lessons/package.json": JSON.stringify({
          name: "@owned/lessons",
          exports: { ".": "./server/index.ts" },
        }),
      },
    });
    expect(result.findings.some((finding) => finding.rule === rule)).toBe(true);
  }
});

it("keeps workspace cycles visible through canonical public package aliases", async () => {
  const result = await checkAliases({
    specifier: "@owned/lessons",
    paths: {
      "@owned/lessons": ["./node_modules/@owned/lessons"],
      "@owned/learning": ["./node_modules/@owned/learning"],
    },
    files: {
      "src/business/lessons/package.json": JSON.stringify({
        name: "@owned/lessons",
        exports: { ".": "./server/index.ts" },
      }),
      "src/business/learning/package.json": JSON.stringify({
        name: "@owned/learning",
        exports: { ".": "./server/index.ts" },
      }),
      "src/business/lessons/server/index.ts":
        'export { progress } from "@owned/learning";',
      "src/business/learning/server/index.ts":
        'export { readLesson } from "@owned/lessons";',
    },
  });
  expect(
    result.findings.some((finding) => finding.rule === "module-cycle"),
  ).toBe(true);
});

it("preserves selected alias target order and reverse alias declaration order", async () => {
  const aliases: Record<string, string[]>[] = [
    { "@business/*": ["./src/business/*"], "*": ["./src/infra/config.ts"] },
    {
      "@business/lessons/server": ["./src/business/lessons/server/index.ts"],
      "@business/*": ["./src/infra/config.ts"],
    },
    {
      "@business/*": ["./missing/*", "./src/business/*"],
      "*": ["./src/infra/config.ts"],
    },
  ];
  for (const paths of aliases) {
    const result = await checkAliases({ paths });
    expect(
      result.findings.some(({ rule }) => rule === "layer-dependency"),
    ).toBe(true);
  }
});

it("does not expand an exact alias as a prefix", async () => {
  const result = await checkAliases({
    paths: { "@business": ["./src/business/lessons/server/index.ts"] },
  });
  expect(result.findings).toEqual([]);
});
