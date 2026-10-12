import { describe, expect, it } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createFixtureRepository } from "../../../__tests__/fixture-repository.ts";
import { type ApiBoundaryConfig, runApiBoundariesCheck } from "../../index.ts";
import { checkApiBoundaries } from "../check-api-boundaries.ts";

const config: ApiBoundaryConfig = {
  sourceRoot: "src",
  serverApiRoots: ["src/api/server"],
  generatedRoot: "src/api/generated",
  transportFiles: ["src/api/server/transport.ts"],
  clientEntryFiles: ["src/client.tsx"],
};
const files = {
  "src/api/server/transport.ts": "export const request = () => undefined;",
  "src/client.tsx": '"use client"; export {};',
  "src/request.ts": 'fetch("/must-be-checked");',
  "outside.ts": "export {};",
  "src/note.txt": "not source code",
};

for (const [name, check] of Object.entries({
  runApiBoundariesCheck,
  checkApiBoundaries,
})) {
  describe(`${name} config validation`, () => {
    it.each(["missing", "src/request.ts", "../outside", ".", " "])(
      "rejects invalid sourceRoot %s before returning an empty success",
      async (sourceRoot) => {
        using fixture = createFixtureRepository(files);
        await expect(
          check({ ...config, sourceRoot }, { cwd: fixture.path }),
        ).rejects.toThrow("sourceRoot");
      },
    );
  });
}

describe("filesystem-backed API config", () => {
  it("does not allow a raw transport or an unprotected file to become a public server service", async () => {
    using fixture = createFixtureRepository(files);
    for (const path of ["src/api/server/transport.ts", "src/request.ts"]) {
      await expect(
        runApiBoundariesCheck(
          {
            ...config,
            serverServiceFiles: [path],
          },
          { cwd: fixture.path },
        ),
      ).rejects.toThrow("serverServiceFiles");
    }
  });

  it.each(["transportFiles", "clientEntryFiles"] as const)(
    "requires nonempty %s",
    async (key) => {
      using fixture = createFixtureRepository(files);
      await expect(
        runApiBoundariesCheck({ ...config, [key]: [] }, { cwd: fixture.path }),
      ).rejects.toThrow(key);
    },
  );

  for (const key of ["transportFiles", "clientEntryFiles"] as const) {
    it.each([
      "src/missing.ts",
      "src/request.ts/child.ts",
      "src/api",
      "outside.ts",
      "src/note.txt",
      "src/*.ts",
      " ",
    ])(`rejects invalid ${key} path %s`, async (path) => {
      using fixture = createFixtureRepository(files);
      await expect(
        runApiBoundariesCheck(
          { ...config, [key]: [path] },
          { cwd: fixture.path },
        ),
      ).rejects.toThrow(key);
    });
  }

  it.each([
    ["transportFiles", "src/__tests__/transport.ts"],
    ["clientEntryFiles", "src/client.test.tsx"],
    ["scopedExceptionFiles", "src/request.spec.ts"],
  ] as const)("rejects test source configured as %s", async (key, path) => {
    using fixture = createFixtureRepository({ ...files, [path]: "export {};" });
    const overrides =
      key === "scopedExceptionFiles"
        ? {
            scopedExceptionFiles: [
              {
                path,
                reason: "Reviewed exception",
                allowedRules: ["direct-fetch"] as const,
              },
            ],
          }
        : { [key]: [path] };

    await expect(
      runApiBoundariesCheck({ ...config, ...overrides }, { cwd: fixture.path }),
    ).rejects.toThrow(key);
  });

  it("does not permit a scoped exception for a production test-source import", async () => {
    using fixture = createFixtureRepository(files);
    await expect(
      runApiBoundariesCheck(
        {
          ...config,
          scopedExceptionFiles: [
            {
              path: "src/request.ts",
              reason: "This must not be suppressible.",
              allowedRules: ["test-source-import"] as never,
            },
          ],
        },
        { cwd: fixture.path },
      ),
    ).rejects.toThrow("scopedExceptionFiles");
  });

  it.each([
    "src/missing.ts",
    "src/request.ts/child.ts",
    "src/api",
    "outside.ts",
    "src/note.txt",
    "src/*.ts",
  ])("rejects invalid scoped exception %s", async (path) => {
    using fixture = createFixtureRepository(files);
    await expect(
      runApiBoundariesCheck(
        {
          ...config,
          scopedExceptionFiles: [
            {
              path,
              reason: "Reviewed integration",
              allowedRules: ["direct-fetch"],
            },
          ],
        },
        { cwd: fixture.path },
      ),
    ).rejects.toThrow("scopedExceptionFiles");
  });

  it("rejects invalid serverApiRoots", async () => {
    using fixture = createFixtureRepository(files);
    for (const serverApiRoots of [
      [],
      ["src/request.ts"],
      ["src/request.ts/future"],
      ["outside"],
      ["../outside"],
      ["src"],
      [" "],
    ]) {
      await expect(
        runApiBoundariesCheck(
          { ...config, serverApiRoots },
          { cwd: fixture.path },
        ),
      ).rejects.toThrow("serverApiRoots");
    }
  });

  it("allows an empty serverApiRoots only with an explicit serverApiFiles allowlist", async () => {
    using fixture = createFixtureRepository(files);

    await expect(
      runApiBoundariesCheck(
        {
          ...config,
          serverApiFiles: ["src/request.ts"],
          serverApiRoots: [],
        },
        { cwd: fixture.path },
      ),
    ).resolves.toBeDefined();
  });

  for (const key of ["generatedRoot"] as const) {
    it.each([
      "src/request.ts",
      "src/request.ts/future",
      "outside",
      "../outside",
      "src",
      " ",
    ])(`rejects invalid ${key} %s`, async (path) => {
      using fixture = createFixtureRepository(files);
      await expect(
        runApiBoundariesCheck(
          { ...config, [key]: path },
          { cwd: fixture.path },
        ),
      ).rejects.toThrow(key);
    });
  }

  it("permits absent future protected roots without suppressing existing source findings", async () => {
    using fixture = createFixtureRepository(files);
    const result = await runApiBoundariesCheck(
      {
        ...config,
        serverApiRoots: ["src/future/server"],
        generatedRoot: "src/future/generated",
      },
      { cwd: fixture.path },
    );
    expect(result.findings).toEqual([
      expect.objectContaining({ path: "src/request.ts", rule: "direct-fetch" }),
    ]);
  });

  it("enforces future protected roots as soon as their source files exist", async () => {
    using fixture = createFixtureRepository(files);
    const futureConfig = {
      ...config,
      serverApiRoots: ["src/future/server"],
      generatedRoot: "src/future/generated",
    };
    mkdirSync(resolve(fixture.path, "src/future/server"), { recursive: true });
    mkdirSync(resolve(fixture.path, "src/future/generated"), {
      recursive: true,
    });
    writeFileSync(
      resolve(fixture.path, "src/future/server/manual.ts"),
      "export const unsafe: any = {};",
    );
    writeFileSync(
      resolve(fixture.path, "src/future/generated/model.ts"),
      "export const generated = {};",
    );
    writeFileSync(
      resolve(fixture.path, "src/client.tsx"),
      '"use client"; import { generated } from "./future/generated/model"; void generated;',
    );
    const result = await runApiBoundariesCheck(futureConfig, {
      cwd: fixture.path,
    });
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        path: "src/future/server/manual.ts",
        rule: "manual-api-type",
      }),
    );
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        path: "src/client.tsx",
        rule: "client-server-import",
      }),
    );
  });

  it("normalizes config paths before matching imports, transports and exceptions", async () => {
    using fixture = createFixtureRepository({
      ...files,
      "src/api/server/transport.ts":
        'export const request = () => fetch("/allowed");',
    });
    const result = await runApiBoundariesCheck(
      {
        ...config,
        sourceRoot: "./src/",
        serverApiRoots: ["./src/api/./server/"],
        generatedRoot: "./src/api/generated/",
        transportFiles: ["./src/api/./server/transport.ts"],
        clientEntryFiles: ["./src/client.tsx"],
        scopedExceptionFiles: [
          {
            path: "./src/./request.ts",
            reason: "Reviewed integration",
            allowedRules: ["direct-fetch"],
          },
        ],
      },
      { cwd: fixture.path },
    );
    expect(result.findings).toEqual([]);
  });

  it("rejects a sourceRoot symlink outside cwd", async () => {
    using outside = createFixtureRepository(files);
    using fixture = createFixtureRepository({});
    symlinkSync(resolve(outside.path, "src"), resolve(fixture.path, "src"));
    await expect(
      runApiBoundariesCheck(config, { cwd: fixture.path }),
    ).rejects.toThrow("sourceRoot");
  });

  it("rejects configured source files reached through a symlink outside sourceRoot", async () => {
    using fixture = createFixtureRepository(files);
    symlinkSync(
      resolve(fixture.path, "outside.ts"),
      resolve(fixture.path, "src/linked.ts"),
    );
    await expect(
      runApiBoundariesCheck(
        { ...config, transportFiles: ["src/linked.ts"] },
        { cwd: fixture.path },
      ),
    ).rejects.toThrow("transportFiles");
  });

  it("rejects a future root beneath a symlink outside sourceRoot", async () => {
    using fixture = createFixtureRepository(files);
    mkdirSync(resolve(fixture.path, "outside"));
    symlinkSync(
      resolve(fixture.path, "outside"),
      resolve(fixture.path, "src/linked"),
    );
    await expect(
      runApiBoundariesCheck(
        { ...config, generatedRoot: "src/linked/future" },
        { cwd: fixture.path },
      ),
    ).rejects.toThrow("generatedRoot");
  });

  it("rejects required source files excluded from the git-backed scan", async () => {
    using fixture = createFixtureRepository({
      ...files,
      ".gitignore": "src/client.tsx\n",
    });
    await expect(
      runApiBoundariesCheck(config, { cwd: fixture.path }),
    ).rejects.toThrow("clientEntryFiles");
  });
});

describe("API config CLI failures", () => {
  it.each([
    ["sourceRoot", { sourceRoot: "missing" }],
    ["sourceRoot", { sourceRoot: "src/request.ts" }],
    ["transportFiles", { transportFiles: ["src/missing.ts"] }],
    ["clientEntryFiles", { clientEntryFiles: ["src/api"] }],
    [
      "scopedExceptionFiles",
      {
        scopedExceptionFiles: [
          {
            path: "src/missing.ts",
            reason: "Reviewed",
            allowedRules: ["direct-fetch"],
          },
        ],
      },
    ],
  ])("returns config exit 2 for invalid %s", async (key, overrides) => {
    using fixture = createFixtureRepository({
      ...files,
      "custom-config.json": JSON.stringify({ ...config, ...overrides }),
    });
    const child = Bun.spawn(
      [
        process.execPath,
        resolve(import.meta.dir, "../../cli.ts"),
        "api-boundaries",
        "--config",
        "custom-config.json",
      ],
      { cwd: fixture.path, stderr: "pipe", stdout: "pipe" },
    );
    const stderr = await new Response(child.stderr).text();
    expect(await child.exited).toBe(2);
    expect(stderr).toContain("custom-config.json");
    expect(stderr).toContain(key as string);
  });
});
