import { describe, expect, it } from "bun:test";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { createFixtureRepository } from "./fixture-repository.ts";

const cliPath = resolve(import.meta.dir, "../src/cli.ts");

const runCli = async (cwd: string, args: readonly string[]) => {
  const child = Bun.spawn([process.execPath, cliPath, ...args], {
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });

  return {
    exitCode: await child.exited,
    stderr: await new Response(child.stderr).text(),
    stdout: await new Response(child.stdout).text(),
  };
};

const createArchitectureFixture = () =>
  createFixtureRepository({
    "lints.config.json": JSON.stringify({
      disallowedExternalImports: ["oxide.ts", "oxide.ts/core"],
      mode: "warn",
      preset: "domain-first-next",
      resultBoundary: "src/core/toolings/result",
      sourceRoot: "src",
    }),
    "src/domains/news/utils.ts": "export const getNews = () => {};\n",
  });

describe("insta-lints architecture", () => {
  it("enforces module-style boundaries through the CLI", async () => {
    using fixture = createFixtureRepository({
      "lints.config.json": JSON.stringify({
        preset: "module-style",
        mode: "strict",
        sourceRoot: "src",
      }),
      "src/index.ts": 'export * from "./item";\n',
      "src/item.ts": "export const item = 1;\n",
    });

    const result = await runCli(fixture.path, [
      "architecture",
      "--config",
      "lints.config.json",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("index-boundary");
  });

  it("reports findings without failing in warn mode", async () => {
    using fixture = createArchitectureFixture();

    const result = await runCli(fixture.path, [
      "architecture",
      "--config",
      "lints.config.json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("file-naming");
  });

  it("fails findings in strict mode", async () => {
    using fixture = createArchitectureFixture();

    const result = await runCli(fixture.path, [
      "architecture",
      "--config",
      "lints.config.json",
      "--strict",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("file-naming");
  });

  it("returns usage failure for an invalid command", async () => {
    using fixture = createArchitectureFixture();

    const result = await runCli(fixture.path, [
      "unexpected",
      "--config",
      "lints.config.json",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("architecture");
  });

  it("returns usage failure for a missing config file", async () => {
    using fixture = createArchitectureFixture();

    const result = await runCli(fixture.path, [
      "architecture",
      "--config",
      "missing.json",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("missing.json");
  });

  it("returns usage failure for invalid config JSON", async () => {
    using fixture = createArchitectureFixture();
    writeFileSync(join(fixture.path, "invalid.json"), "not JSON\n", "utf8");

    const result = await runCli(fixture.path, [
      "architecture",
      "--config",
      "invalid.json",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("invalid.json");
  });

  it("rejects unknown architecture presets", async () => {
    using fixture = createFixtureRepository({
      "lints.config.json": JSON.stringify({
        sourceRoot: "src",
        preset: "unknown",
      }),
      "src/value.ts": "export const value = 1;\n",
    });
    const result = await runCli(fixture.path, [
      "architecture",
      "--config",
      "lints.config.json",
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("preset");
  });

  it("rejects non-exact environment owners", async () => {
    using fixture = createFixtureRepository({
      "lints.config.json": JSON.stringify({
        sourceRoot: "src",
        preset: "module-style",
        environmentFiles: ["src/**"],
      }),
      "src/value.ts": "export const value = 1;\n",
    });
    const result = await runCli(fixture.path, [
      "architecture",
      "--config",
      "lints.config.json",
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("environmentFiles");
  });

  it.each([
    [{ mode: "fatal" }, "mode должен быть warn или strict"],
    [{ sourceRoot: " " }, "sourceRoot должен быть непустой строкой"],
  ])(
    "preserves architecture config diagnostics",
    async (overrides, message) => {
      using fixture = createFixtureRepository({
        "lints.config.json": JSON.stringify({
          sourceRoot: "src",
          ...overrides,
        }),
        "src/value.ts": "export const value = 1;\n",
      });
      const result = await runCli(fixture.path, [
        "architecture",
        "--config",
        "lints.config.json",
      ]);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toBe(
        `insta-lints: не удалось разобрать конфигурацию lints.config.json: ${message}\n`,
      );
    },
  );
});

describe("insta-lints api-boundaries", () => {
  it("enforces protected package transports from JSON configuration", async () => {
    using fixture = createFixtureRepository({
      "api-boundaries.config.json": JSON.stringify({
        clientEntryFiles: ["src/client-entry.ts"],
        generatedRoot: "src/api/generated",
        serverApiRoots: ["src/api/server"],
        sourceRoot: "src",
        transportFiles: ["src/api/server/transport.ts"],
        transportPackageSpecifiers: ["@newstartby/api/transport"],
      }),
      "src/api/server/transport.ts":
        "export const request = () => undefined;\n",
      "src/client-entry.ts": "export {};\n",
      "src/features/request.ts": [
        'import { createApiTransport } from "@newstartby/api/transport";',
        "void createApiTransport;",
      ].join("\n"),
    });

    const result = await runCli(fixture.path, [
      "api-boundaries",
      "--config",
      "api-boundaries.config.json",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("transport-boundary");
  });

  it.each([
    [
      { clientEntryFiles: [] },
      "clientEntryFiles должен быть непустым массивом непустых путей",
    ],
    [
      { scopedExceptionFiles: [{}] },
      "scopedExceptionFiles.allowedRules содержит неизвестное правило",
    ],
  ])("preserves API config diagnostics", async (overrides, message) => {
    using fixture = createFixtureRepository({
      "api-boundaries.config.json": JSON.stringify({
        clientEntryFiles: ["src/client.ts"],
        generatedRoot: "src/generated",
        serverApiRoots: ["src/server"],
        sourceRoot: "src",
        transportFiles: ["src/server/transport.ts"],
        ...overrides,
      }),
      "src/client.ts": "export {};\n",
      "src/server/transport.ts": "export {};\n",
    });
    const result = await runCli(fixture.path, [
      "api-boundaries",
      "--config",
      "api-boundaries.config.json",
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe(
      `insta-lints: не удалось разобрать конфигурацию api-boundaries.config.json: ${message}\n`,
    );
  });
});
