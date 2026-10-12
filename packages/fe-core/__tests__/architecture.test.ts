import { describe, expect, it } from "bun:test";

import { runArchitectureCheck } from "../src/index.ts";
import { createFixtureRepository } from "./fixture-repository.ts";

describe("runArchitectureCheck", () => {
  it("exposes a stable public API", async () => {
    using fixture = createFixtureRepository({
      "src/domains/news/lib/get-news-title.ts":
        'export const getNewsTitle = () => "Новости";\n',
    });

    const result = await runArchitectureCheck(
      { mode: "warn", sourceRoot: "src" },
      { cwd: fixture.path },
    );

    expect(result).toEqual({ findings: [], mode: "warn" });
  });

  it("reports every domain-first rule in a stable order", async () => {
    using fixture = createFixtureRepository({
      "src/core/toolings/result/result.ts":
        'import { Result } from "oxide.ts";\nexport { Result };\n',
      "src/domains/news/configs/api.ts": "export const api = {};\n",
      "src/domains/news/dto/news/news-api.dto.ts":
        "export type NewsApiDto = {};\n",
      "src/domains/news/helpers/read.ts": "export const read = () => {};\n",
      "src/domains/news/news-dto.ts": "export type NewsDto = {};\n",
      "src/domains/news/news-service.ts": "export const news = () => {};\n",
      "src/domains/news/news.dto.ts": "export type NewsDto = {};\n",
      "src/domains/news/news.map.ts": "export const mapNews = () => {};\n",
      "src/domains/news/newsConfig.ts": "export const newsConfig = {};\n",
      "src/domains/news/service.ts": [
        'import { Result } from "oxide.ts/core";',
        "export const first = () => Result;",
        "export const second = () => Result;",
      ].join("\n"),
      "src/domains/news/utils.ts": "export const getNews = () => {};\n",
    });

    const result = await runArchitectureCheck(
      { mode: "warn", sourceRoot: "src" },
      { cwd: fixture.path },
    );

    expect(result.findings).toEqual([
      {
        example: "src/domains/news/lib/get-news-title.ts",
        message:
          "`utils.ts` скрывает ответственность файла. Используй конкретное действие в имени.",
        path: "src/domains/news/utils.ts",
        rule: "file-naming",
      },
      {
        example: "lib/read-news-page-search-params.ts",
        message:
          "Папка `helpers/` слишком размытая. Используй `lib/` и конкретные имена файлов.",
        path: "src/domains/news/helpers/read.ts",
        rule: "folder-naming",
      },
      {
        example: "config/api-sources.config.ts",
        message:
          "Папка `configs/` не используется. Для статичной конфигурации ожидается `config/`.",
        path: "src/domains/news/configs/api.ts",
        rule: "folder-naming",
      },
      {
        example: "news.service.ts",
        message: "Фасадный service-файл должен называться `<name>.service.ts`.",
        path: "src/domains/news/news-service.ts",
        rule: "service-naming",
      },
      {
        example: "asset.config.ts",
        message: "Статичная конфигурация должна называться `<name>.config.ts`.",
        path: "src/domains/news/newsConfig.ts",
        rule: "config-naming",
      },
      {
        example: "src/domains/news/server/lib/news-collection.map.ts",
        message: "Мапперы должны лежать в `lib/` или `server/lib/`.",
        path: "src/domains/news/news.map.ts",
        rule: "mapper-layout",
      },
      {
        example: "dto/news/news-api.dto.ts",
        message: "DTO-файлы должны иметь суффикс `.dto.ts`.",
        path: "src/domains/news/news-dto.ts",
        rule: "dto-naming",
      },
      {
        example: "src/domains/news/dto/news/news-api.dto.ts",
        message: "DTO ожидается в формате `dto/<entity>/<entity>-*.dto.ts`.",
        path: "src/domains/news/news.dto.ts",
        rule: "dto-layout",
      },
      {
        example:
          'import { ResultService, type Result } from "@/core/toolings";',
        message:
          "`oxide.ts` импортируем только внутри `src/core/toolings/result`. Остальной код использует core alias layer.",
        path: "src/domains/news/service.ts",
        rule: "oxide-import-boundary",
      },
      {
        example:
          "оставь один public function/class на файл или вынеси соседнюю ответственность отдельно",
        message:
          "В обычном implementation-файле найдено публичных function/class exports: 2.",
        path: "src/domains/news/service.ts",
        rule: "export-count",
      },
    ]);
  });

  it("uses the legacy mapper naming message", async () => {
    using fixture = createFixtureRepository({
      "src/domains/news/lib/map-news.ts": "export const mapNews = () => {};\n",
    });

    const result = await runArchitectureCheck(
      { sourceRoot: "src" },
      { cwd: fixture.path },
    );

    expect(result.findings).toContainEqual({
      rule: "mapper-naming",
      path: "src/domains/news/lib/map-news.ts",
      message: "Мапперы называем в формате `*.map.ts`.",
      example: "news-collection.map.ts",
    });
  });

  it("enforces module boundaries and production-test separation", async () => {
    using fixture = createFixtureRepository({
      "src/domains/news/__tests__/news.service.test.ts":
        'export const testName = "news";\n',
      "src/domains/news/bad.test.ts": 'export const bad = "test";\n',
      "src/domains/news/index.ts": [
        'export * from "./news";',
        "export const implementation = true;",
      ].join("\n"),
      "src/domains/news/many.ts": [
        "export const one = 1;",
        "export const two = 2;",
        "export const three = 3;",
        "export const four = 4;",
      ].join("\n"),
      "src/domains/news/news.ts":
        'import "./__tests__/news.service.test";\nexport const news = true;\n',
      "src/domains/news/types.ts": [
        'import { runtime } from "./runtime";',
        "export interface News { id: string }",
        "export const defaultNews = {};",
      ].join("\n"),
      "src/domains/news/runtime.ts": "export const runtime = true;\n",
    });

    const result = await runArchitectureCheck(
      { mode: "warn", sourceRoot: "src" },
      { cwd: fixture.path },
    );

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "src/domains/news/index.ts",
          rule: "index-boundary",
        }),
        expect.objectContaining({
          path: "src/domains/news/types.ts",
          rule: "types-file-purity",
        }),
        expect.objectContaining({
          path: "src/domains/news/many.ts",
          rule: "runtime-export-count",
        }),
        expect.objectContaining({
          path: "src/domains/news/bad.test.ts",
          rule: "test-placement",
        }),
        expect.objectContaining({
          path: "src/domains/news/news.ts",
          rule: "production-test-import",
        }),
      ]),
    );
  });

  it("allows explicit boundaries, colocated tests and simple positional APIs", async () => {
    using fixture = createFixtureRepository({
      "src/domains/news/__tests__/news.test.ts":
        'import { clamp } from "../lib/clamp";\nvoid clamp(1, 0, 2);\n',
      "src/domains/news/index.ts":
        'export { clamp } from "./lib/clamp";\nexport type { News } from "./types";\n',
      "src/domains/news/lib/clamp.ts":
        "export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));\n",
      "src/domains/news/types.ts":
        'import type { ReactNode } from "react";\nexport interface News { id: string; content?: ReactNode }\n',
    });

    const result = await runArchitectureCheck(
      { mode: "warn", sourceRoot: "src" },
      { cwd: fixture.path },
    );

    expect(result.findings).toEqual([]);
  });

  it("keeps conts.ts limited to immutable static values", async () => {
    using fixture = createFixtureRepository({
      "src/domains/news/conts.ts": "export let currentPage = 1;\n",
      "src/domains/posts/conts.ts": "export const fetchPage = () => 1;\n",
      "src/domains/comments/conts.ts":
        "export const fetchPage = (() => 1) satisfies () => number;\n",
      "src/domains/users/conts.ts":
        'export const USER_ROLE = { admin: "admin", member: "member" } as const;\n',
      "src/domains/pages/conts.ts":
        "const PAGE_SIZE = 20; export { PAGE_SIZE };\n",
      "src/domains/contracts/conts.ts":
        'const KEYS = { id: "id" } as const; export const PATTERN = /^[a-z]+$/; export const VALUES = { [KEYS.id]: "value" };\n',
    });

    const result = await runArchitectureCheck(
      { sourceRoot: "src" },
      { cwd: fixture.path },
    );

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        path: "src/domains/news/conts.ts",
        rule: "conts-file-purity",
      }),
    );
    for (const path of [
      "src/domains/posts/conts.ts",
      "src/domains/comments/conts.ts",
    ]) {
      expect(result.findings).toContainEqual(
        expect.objectContaining({ path, rule: "conts-file-purity" }),
      );
    }
    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ path: "src/domains/users/conts.ts" }),
    );
    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ path: "src/domains/pages/conts.ts" }),
    );
    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ path: "src/domains/contracts/conts.ts" }),
    );
  });

  it("checks common module boundaries without Next-specific layout rules", async () => {
    using fixture = createFixtureRepository({
      "src/widgets/index.ts": 'export * from "./widget";\n',
      "src/widgets/widget.ts": "export const widget = 1;\n",
      "src/widgets/newsConfig.ts": "export const newsConfig = 1;\n",
      "src/widgets/conts.ts": "export let limit = 10;\n",
    });

    const result = await runArchitectureCheck(
      { preset: "module-style", sourceRoot: "src" },
      { cwd: fixture.path },
    );

    expect(result.findings.map(({ rule }) => rule).sort()).toEqual([
      "conts-file-purity",
      "index-boundary",
    ]);
  });

  it("keeps module-style free of Next layout, test placement and export quotas", async () => {
    using fixture = createFixtureRepository({
      "src/widgets/config.ts": "export const configure = () => 1;\n",
      "src/widgets/value.mapper.ts": "export const mapValue = () => 1;\n",
      "src/widgets/local.dto.ts": "export type LocalDto = { id: string };\n",
      "src/widgets/operations.ts":
        "export const first = () => 1; export const second = () => 2; export const third = () => 3; export const fourth = () => 4;\n",
      "src/widgets/check.test.ts": "export const check = true;\n",
    });
    const portable = await runArchitectureCheck(
      { preset: "module-style", sourceRoot: "src" },
      { cwd: fixture.path },
    );
    expect(portable.findings).toEqual([]);
    const omitted = await runArchitectureCheck(
      { sourceRoot: "src" },
      { cwd: fixture.path },
    );
    const explicit = await runArchitectureCheck(
      { preset: "domain-first-next", sourceRoot: "src" },
      { cwd: fixture.path },
    );
    expect(omitted).toEqual(explicit);
    expect(omitted.findings.length).toBeGreaterThan(0);
  });

  it("rejects wildcard, namespace and public default exports in index.ts", async () => {
    using fixture = createFixtureRepository({
      "src/a/index.ts": 'export * from "./value";\n',
      "src/b/index.ts": 'export * as values from "./value";\n',
      "src/c/index.ts": 'export { value as default } from "./value";\n',
      "src/d/index.ts":
        'export { default as Button } from "./Button";\nexport type { Props } from "./types";\n',
    });
    const result = await runArchitectureCheck(
      { preset: "module-style", sourceRoot: "src" },
      { cwd: fixture.path },
    );
    expect(
      result.findings
        .filter(({ rule }) => rule === "index-boundary")
        .map(({ path }) => path)
        .sort(),
    ).toEqual(["src/a/index.ts", "src/b/index.ts", "src/c/index.ts"]);
  });

  it("rejects executable conts initializers, side effects and wrapped functions", async () => {
    using fixture = createFixtureRepository({
      "src/a/conts.ts": "export const client = createClient();\n",
      "src/b/conts.ts": "export const cache = new Map();\n",
      "src/c/conts.ts": 'import "./setup"; export const VALUE = 1;\n',
      "src/d/conts.ts": "export const handler = (() => 1) as () => number;\n",
      "src/e/conts.ts": "const VALUE = 1; export { VALUE as default };\n",
      "src/f/conts.ts": "const VALUE = 1; VALUE++; export { VALUE };\n",
      "src/g/conts.ts":
        "import type { Value } from './types'; const VALUE = { id: 1 } as const satisfies Value; export { VALUE };\n",
    });
    const result = await runArchitectureCheck(
      { preset: "module-style", sourceRoot: "src" },
      { cwd: fixture.path },
    );
    expect(
      result.findings
        .filter(({ rule }) => rule === "conts-file-purity")
        .map(({ path }) => path)
        .sort(),
    ).toEqual([
      "src/a/conts.ts",
      "src/b/conts.ts",
      "src/c/conts.ts",
      "src/d/conts.ts",
      "src/e/conts.ts",
      "src/f/conts.ts",
    ]);
  });

  it("rejects importing an ancestor barrel through relative and aliased paths", async () => {
    using fixture = createFixtureRepository({
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          target: "ES2022",
          baseUrl: ".",
          paths: {
            "@widgets": ["src/widgets/index.ts"],
            "@widgets/*": ["src/widgets/*"],
          },
        },
        include: ["src/**/*.ts"],
      }),
      "src/widgets/index.ts": 'export { value } from "./value";\n',
      "src/widgets/value.ts":
        'import { value } from "./index"; export const next = value;\n',
      "src/widgets/alias.ts": 'export { value } from "@widgets/index";\n',
      "src/widgets/dynamic.ts":
        'const source = import("@widgets"); export { source };\n',
      "src/widgets/js-extension.ts":
        'import { value } from "./index.js"; export const next = value;\n',
      "src/widgets/sibling/index.ts": 'export { item } from "./item";\n',
      "src/widgets/sibling/item.ts": "export const item = 1;\n",
      "src/widgets/useSibling.ts":
        'import { item } from "./sibling"; export const result = item;\n',
    });
    const result = await runArchitectureCheck(
      { preset: "module-style", sourceRoot: "src" },
      { cwd: fixture.path },
    );
    expect(
      result.findings
        .filter(({ rule }) => rule === "own-barrel-import")
        .map(({ path }) => path)
        .sort(),
    ).toEqual([
      "src/widgets/alias.ts",
      "src/widgets/dynamic.ts",
      "src/widgets/js-extension.ts",
      "src/widgets/value.ts",
    ]);
  });

  it("resolves a wildcard alias without treating its exact alias as a prefix", async () => {
    using fixture = createFixtureRepository({
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          target: "ES2022",
          baseUrl: ".",
          paths: {
            "@widgets": ["src/widgets/index.ts"],
            "@widgets/*": ["src/widgets/*"],
          },
        },
        include: ["src/**/*.ts"],
      }),
      "src/widgets/index.ts": 'export { value } from "./value";\n',
      "src/widgets/value.ts": "export const value = 1;\n",
      "src/widgets/consumer.ts":
        'import { value } from "@widgets/value"; export const result = value;\n',
    });
    const result = await runArchitectureCheck(
      { preset: "module-style", sourceRoot: "src" },
      { cwd: fixture.path },
    );
    expect(
      result.findings.filter(({ rule }) => rule === "own-barrel-import"),
    ).toEqual([]);
  });

  it("restricts raw env access outside exact owner files without flagging shadowed names", async () => {
    using fixture = createFixtureRepository({
      "src/config/env.ts": "export const value = process.env.KEY;\n",
      "src/a.ts": "export const value = process.env.KEY;\n",
      "src/b.ts": "export const value = Bun['env'].KEY;\n",
      "src/c.ts": "export const value = import.meta.env.KEY;\n",
      "src/d.ts":
        "export const read = (process: {env: string}) => process.env;\n",
      "src/e.ts":
        'import { env } from "node:process"; export const secret = env.KEY;\n',
      "src/f.ts":
        'import runtime from "node:process"; export const secret = runtime.env.KEY;\n',
      "src/g.ts":
        'import { env as rawEnv } from "node:process"; export const secret = rawEnv.KEY;\n',
    });
    const result = await runArchitectureCheck(
      {
        preset: "module-style",
        sourceRoot: "src",
        environmentFiles: ["src/config/env.ts"],
      },
      { cwd: fixture.path },
    );
    expect(
      result.findings
        .filter(({ rule }) => rule === "environment-access")
        .map(({ path }) => path)
        .sort(),
    ).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
      "src/e.ts",
      "src/f.ts",
      "src/g.ts",
    ]);
  });

  it("enforces a single named service factory", async () => {
    using fixture = createFixtureRepository({
      "src/a.service.ts":
        "export const createAService = () => ({ run: () => 1 });\n",
      "src/b.service.ts": "export default class BService {}\n",
      "src/c.service.ts": "export const service = { run: () => 1 };\n",
      "src/d.service.ts":
        "export const createDService = () => ({}); export const extra = 1;\n",
    });
    const result = await runArchitectureCheck(
      { preset: "module-style", sourceRoot: "src" },
      { cwd: fixture.path },
    );
    expect(
      result.findings
        .filter(({ rule }) => rule === "service-factory")
        .map(({ path }) => path)
        .sort(),
    ).toEqual(["src/b.service.ts", "src/c.service.ts", "src/d.service.ts"]);
  });

  it("accepts a named factory export declaration and rejects additional runtime exports", async () => {
    using fixture = createFixtureRepository({
      "src/a.service.ts":
        "const createAService = () => ({}); export { createAService };\n",
      "src/b.service.ts":
        "export const createBService = () => ({}); const extra = 1; export { extra };\n",
    });
    const result = await runArchitectureCheck(
      { preset: "module-style", sourceRoot: "src" },
      { cwd: fixture.path },
    );
    expect(
      result.findings
        .filter(({ rule }) => rule === "service-factory")
        .map(({ path }) => path),
    ).toEqual(["src/b.service.ts"]);
  });
});
