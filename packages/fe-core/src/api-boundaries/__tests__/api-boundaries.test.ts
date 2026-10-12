import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { createFixtureRepository as createRepository } from "../../../__tests__/fixture-repository.ts";
import { runApiBoundariesCheck } from "../../index.ts";

// Every rule fixture supplies the files required by its consumer config.
const createFixtureRepository = (files: Record<string, string>) =>
  createRepository({
    "src/api/server/transport.ts": "export const request = () => undefined;",
    "src/client-entry.tsx": "export {};",
    ...files,
  });

const cliPath = resolve(import.meta.dir, "../../cli.ts");

const apiBoundariesConfig = {
  clientEntryFiles: ["src/client-entry.tsx"],
  generatedRoot: "src/api/generated",
  serverApiRoots: ["src/api/server"],
  sourceRoot: "src",
  transportFiles: ["src/api/server/transport.ts"],
};

const runCli = async (cwd: string, args: readonly string[]) => {
  const child = Bun.spawn([process.execPath, cliPath, ...args], {
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });

  return {
    exitCode: await child.exited,
    stderr: await new Response(child.stderr).text(),
  };
};

const checkPackageTransportBoundary = async () => {
  using fixture = createFixtureRepository({
    "src/api/server/adapter.ts":
      'import { createApiTransport } from "@newstartby/api/transport"; void createApiTransport;',
    "src/features/direct.ts":
      'import { createApiTransport } from "@newstartby/api/transport"; void createApiTransport;',
    "src/features/client.ts":
      'import { createApiClient } from "@newstartby/api/transport"; void createApiClient;',
    "src/features/dynamic.ts": 'void import("@newstartby/api/transport");',
    "src/features/computed.ts":
      'const name = "@newstartby/api/transport"; void import(name);',
    "src/features/barrel.ts":
      'export { createApiTransport } from "@newstartby/api/transport";',
    "src/features/alias.ts":
      'import { createApiTransport } from "@features/barrel"; void createApiTransport;',
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: { "@features/*": ["src/features/*"] },
      },
    }),
  });
  const result = await runApiBoundariesCheck(
    {
      ...apiBoundariesConfig,
      transportPackageSpecifiers: ["@newstartby/api/transport"],
    },
    { cwd: fixture.path },
  );

  expect(
    result.findings
      .filter(({ rule }) => rule === "transport-boundary")
      .map(({ path }) => path)
      .sort(),
  ).toEqual([
    "src/features/alias.ts",
    "src/features/barrel.ts",
    "src/features/client.ts",
    "src/features/direct.ts",
    "src/features/dynamic.ts",
  ]);
  expect(result.findings).toContainEqual(
    expect.objectContaining({
      path: "src/features/computed.ts",
      rule: "dynamic-import",
    }),
  );
};

describe("runApiBoundariesCheck", () => {
  it("allows server pages to call a service while rejecting their raw transport imports and client service imports", async () => {
    using fixture = createFixtureRepository({
      "src/api/server/service.ts":
        'import { request } from "./transport"; export const getUser = () => request();',
      "src/app/page.tsx":
        'import { getUser } from "../api/server/service"; export const page = () => getUser();',
      "src/app/unsafe.tsx":
        'import { request } from "../api/server/transport"; export const page = () => request();',
      "src/client-entry.tsx":
        '"use client"; import { getUser } from "./api/server/service"; void getUser;',
    });
    const result = await runApiBoundariesCheck(
      {
        ...apiBoundariesConfig,
        serverApiRoots: [],
        serverApiFiles: ["src/api/server/service.ts"],
        serverServiceFiles: ["src/api/server/service.ts"],
      },
      { cwd: fixture.path },
    );
    expect(result.findings.map(({ path, rule }) => ({ path, rule }))).toEqual([
      { path: "src/app/unsafe.tsx", rule: "transport-boundary" },
      { path: "src/client-entry.tsx", rule: "client-server-import" },
    ]);
  });

  it("ignores conventional test sources while still reporting equivalent production violations", async () => {
    using fixture = createFixtureRepository({
      "src/__tests__/request.test.ts": [
        'import { request } from "../api/server/transport";',
        'fetch("/test-only");',
        "void request;",
      ].join("\n"),
      "src/features/news/request.ts": [
        'import { request } from "../../api/server/transport";',
        'fetch("/production");',
        "void request;",
      ].join("\n"),
      "src/features/testimonial/request.ts": 'fetch("/production");',
      "src/features/news/request.spec.tsx": 'fetch("/test-only");',
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });

    expect(result.findings.map(({ path, rule }) => ({ path, rule }))).toEqual([
      { path: "src/features/news/request.ts", rule: "direct-fetch" },
      { path: "src/features/testimonial/request.ts", rule: "direct-fetch" },
      {
        path: "src/features/news/request.ts",
        rule: "transport-boundary",
      },
    ]);
  });

  it("rejects production imports from test barrels that re-export protected API modules", async () => {
    using fixture = createFixtureRepository({
      "src/__tests__/transport-barrel.ts":
        'export { request } from "../api/server/transport";\n',
      "src/features/news/request.ts": [
        'import { request } from "../../__tests__/transport-barrel";',
        "void request;",
      ].join("\n"),
      "src/features/news/server-barrel.spec.ts": [
        'export { serverClient } from "../../api/server/client";',
        'export { generatedClient } from "../../api/generated/client";',
      ].join("\n"),
      "src/features/news/view.ts": [
        'import { serverClient, generatedClient } from "./server-barrel.spec";',
        "void serverClient; void generatedClient;",
      ].join("\n"),
      "src/api/generated/client.ts": "export const generatedClient = {};\n",
      "src/api/server/client.ts": "export const serverClient = {};\n",
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });

    expect(result.findings.map(({ path, rule }) => ({ path, rule }))).toEqual([
      { path: "src/features/news/request.ts", rule: "test-source-import" },
      { path: "src/features/news/view.ts", rule: "test-source-import" },
    ]);
  });

  it("reports direct and global fetch outside the configured transport", async () => {
    using fixture = createFixtureRepository({
      "src/api/server/transport.ts":
        "export const request = (url: string) => fetch(url);\n",
      "src/features/news/request.ts": [
        'export const load = () => fetch("/api/news");',
        'export const refresh = () => globalThis.fetch("/api/news");',
      ].join("\n"),
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        path: "src/features/news/request.ts",
        rule: "direct-fetch",
      }),
      expect.objectContaining({
        path: "src/features/news/request.ts",
        rule: "direct-fetch",
      }),
    ]);
  });

  it("uses tsconfig aliases to block transport imports and re-exports outside the server boundary", async () => {
    using fixture = createFixtureRepository({
      "src/api/server/transport.ts":
        "export const request = () => undefined;\n",
      "src/features/news/re-export.ts":
        'export { request } from "@/api/server/transport";\n',
      "src/features/news/request.ts":
        'import { request } from "@/api/server/transport";\nvoid request;\n',
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          module: "ESNext",
          moduleResolution: "Bundler",
          paths: { "@/*": ["src/*"] },
          target: "ES2022",
        },
        include: ["src/**/*.ts", "src/**/*.tsx"],
      }),
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        path: "src/features/news/re-export.ts",
        rule: "transport-boundary",
      }),
      expect.objectContaining({
        path: "src/features/news/request.ts",
        rule: "transport-boundary",
      }),
    ]);
  });

  it("protects a package transport through direct, dynamic, re-export and aliased imports", async () => {
    await checkPackageTransportBoundary();
  });

  it("blocks direct and barrel server or generated imports reachable from use-client modules", async () => {
    using fixture = createFixtureRepository({
      "src/api/generated/models.ts": "export type News = { id: string };\n",
      "src/api/server/client.ts": "export const serverClient = {};\n",
      "src/api/server/index.ts": 'export * from "./client";\n',
      "src/client-entry.tsx": [
        '"use client";',
        'import { serverClient } from "@/api/server";',
        'import type { News } from "@/api/generated/models";',
        "void serverClient;",
        "void ({} as News);",
      ].join("\n"),
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          module: "ESNext",
          moduleResolution: "Bundler",
          paths: { "@/*": ["src/*"] },
          target: "ES2022",
        },
        include: ["src/**/*.ts", "src/**/*.tsx"],
      }),
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        path: "src/client-entry.tsx",
        rule: "client-server-import",
      }),
      expect.objectContaining({
        path: "src/client-entry.tsx",
        rule: "client-server-import",
      }),
    ]);
  });
});

describe("Server Action API boundaries", () => {
  it("allows a client to invoke a module-level Server Action while blocking direct service imports", async () => {
    using fixture = createFixtureRepository({
      "src/api/server/service.ts": 'export const save = async () => "saved";',
      "src/actions/save.ts": [
        '"use server";',
        'import { save } from "../api/server/service";',
        "export const saveAction = async () => save();",
      ].join("\n"),
      "src/client-entry.tsx": [
        '"use client";',
        'import { saveAction } from "./actions/save";',
        'import { save } from "./api/server/service";',
        "void saveAction; void save;",
      ].join("\n"),
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });
    expect(
      result.findings.filter(({ rule }) => rule === "client-server-import"),
    ).toEqual([expect.objectContaining({ path: "src/client-entry.tsx" })]);
  });

  it("does not let a use-server directive expose generated SDK or transport to clients", async () => {
    using fixture = createFixtureRepository({
      "src/api/generated/client.ts":
        '"use server"; export const sdk = async () => "sdk";',
      "src/api/server/transport.ts":
        '"use server"; export const request = async () => "request";',
      "src/client-entry.tsx": [
        '"use client";',
        'import { sdk } from "./api/generated/client";',
        'import { request } from "./api/server/transport";',
        "void sdk; void request;",
      ].join("\n"),
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });
    expect(
      result.findings.filter(({ rule }) => rule === "client-server-import"),
    ).toHaveLength(2);
  });
});

describe("runApiBoundariesCheck", () => {
  it("fails a dynamically computed import because its boundary cannot be resolved statically", async () => {
    using fixture = createFixtureRepository({
      "src/client-entry.tsx": [
        '"use client";',
        'void import("@/api/server/" + "transport");',
      ].join("\n"),
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        path: "src/client-entry.tsx",
        rule: "dynamic-import",
      }),
    ]);
  });

  it("reports manual API type escapes but exempts generated source from stylistic rules", async () => {
    using fixture = createFixtureRepository({
      "src/api/generated/models.ts": [
        "// @ts-nocheck",
        "export const generated: any = {} as unknown as any;",
      ].join("\n"),
      "src/api/server/transport.ts": [
        "// @ts-ignore legacy upstream response",
        "export const request: any = {} as unknown as { ok: boolean };",
      ].join("\n"),
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });

    expect(result.findings).toEqual([
      expect.objectContaining({ rule: "manual-api-type" }),
      expect.objectContaining({ rule: "manual-api-type" }),
      expect.objectContaining({ rule: "manual-api-type" }),
    ]);
    expect(
      result.findings.every((finding) => !finding.path.includes("generated")),
    ).toBe(true);
  });

  it("does not treat a string literal as a TypeScript suppression", async () => {
    using fixture = createFixtureRepository({
      "src/api/server/manual.ts": [
        'export const note = "@ts-ignore: this is product text";',
        "export const response: unknown = {};",
      ].join("\n"),
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });

    expect(result.findings).toEqual([]);
  });

  it("applies a reviewed exception only to its exact file and allowed rule", async () => {
    using fixture = createFixtureRepository({
      "src/api/server/transport.ts":
        "export const request = () => undefined;\n",
      "src/integrations/approved.ts": [
        'export const load = () => fetch("https://provider.example");',
        "export const unsafe: any = {};",
      ].join("\n"),
      "src/integrations/unapproved.ts":
        'export const load = () => fetch("https://provider.example");\n',
    });

    const result = await runApiBoundariesCheck(
      {
        ...apiBoundariesConfig,
        scopedExceptionFiles: [
          {
            allowedRules: ["direct-fetch"],
            path: "src/integrations/approved.ts",
            reason: "Provider intake is isolated from HAP transport.",
          },
        ],
      },
      { cwd: fixture.path },
    );

    expect(result.findings).toEqual([
      expect.objectContaining({
        path: "src/integrations/unapproved.ts",
        rule: "direct-fetch",
      }),
    ]);
  });

  it("resolves explicit extension transport imports and transitive re-export barrels", async () => {
    using fixture = createFixtureRepository({
      "src/api/server/transport.ts":
        "export const request = () => undefined;\n",
      "src/api/server/first.ts": 'export * from "./transport.ts";\n',
      "src/api/public.ts": 'export * from "./server/first.ts";\n',
      "src/features/news/request.ts":
        'export { request } from "@/api/public";\n',
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          module: "ESNext",
          moduleResolution: "Bundler",
          paths: { "@/*": ["src/*"] },
          target: "ES2022",
        },
        include: ["src/**/*.ts"],
      }),
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        path: "src/features/news/request.ts",
        rule: "transport-boundary",
      }),
    );
  });

  it("reports fetch aliases and imported fetch-capable clients without flagging shadowed fetch", async () => {
    using fixture = createFixtureRepository({
      "src/api/server/transport.ts":
        "export const request = () => undefined;\n",
      "src/features/news/request.ts": [
        "const request = fetch;",
        'request("/api/news");',
        'import { fetch as client } from "@/api/server/http.ts";',
        'client("/api/news");',
        "export const local = (fetch: () => void) => fetch();",
      ].join("\n"),
      "src/api/server/http.ts": "export const fetch = globalThis.fetch;\n",
      "tsconfig.json": JSON.stringify({
        compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } },
        include: ["src/**/*.ts"],
      }),
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });

    expect(
      result.findings.filter((finding) => finding.rule === "direct-fetch"),
    ).toHaveLength(2);
  });

  it("reports use-client modules that are placed inside protected roots, including a barrel", async () => {
    using fixture = createFixtureRepository({
      "src/api/server/client.ts": '"use client";\nexport const client = {};\n',
      "src/api/server/index.ts": 'export * from "./client";\n',
      "src/client-entry.tsx":
        '"use client";\nimport { client } from "@/api/server";\nvoid client;\n',
      "tsconfig.json": JSON.stringify({
        compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } },
        include: ["src/**/*.ts", "src/**/*.tsx"],
      }),
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });

    expect(
      result.findings.filter(
        (finding) => finding.rule === "client-server-import",
      ),
    ).toHaveLength(2);
  });

  it("reports parenthesized double assertions in manual API code", async () => {
    using fixture = createFixtureRepository({
      "src/api/server/transport.ts":
        "export const model = (value: unknown) => (value as unknown) as { id: string };\n",
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({ rule: "manual-api-type" }),
    );
  });

  it("treats use client as a directive only in the directive prologue", async () => {
    using fixture = createFixtureRepository({
      "src/api/server/client.ts": "export const serverClient = {};\n",
      "src/client-entry.tsx": "export const entry = {};\n",
      "src/not-a-client.ts": [
        "const before = 1;",
        '"use client";',
        'import { serverClient } from "./api/server/client";',
        "void before; void serverClient;",
      ].join("\n"),
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });

    expect(
      result.findings.filter(
        (finding) => finding.rule === "client-server-import",
      ),
    ).toHaveLength(0);
  });

  it("resolves runtime js specifiers to TypeScript transport and server sources", async () => {
    using fixture = createFixtureRepository({
      "src/api/server/transport.ts":
        "export const request = () => undefined;\n",
      "src/api/server/client.ts": "export const serverClient = {};\n",
      "src/client-entry.tsx":
        '"use client";\nimport { serverClient } from "@/api/server/client.js";\nvoid serverClient;\n',
      "src/features/news/request.ts":
        'export { request } from "@/api/server/transport.js";\n',
      "tsconfig.json": JSON.stringify({
        compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } },
        include: ["src/**/*.ts", "src/**/*.tsx"],
      }),
    });
    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });
    expect(result.findings.map((finding) => finding.rule)).toEqual([
      "transport-boundary",
      "client-server-import",
    ]);
  });

  it("unwraps arbitrarily nested parenthesized assertions", async () => {
    using fixture = createFixtureRepository({
      "src/api/server/transport.ts":
        "export const model = (value: unknown) => (((value as unknown))) as { id: string };\n",
    });
    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });
    expect(result.findings).toContainEqual(
      expect.objectContaining({ rule: "manual-api-type" }),
    );
  });

  it.each([
    ["global fetch", 'fetch("/global");', 1],
    ["globalThis fetch", 'globalThis.fetch("/global");', 1],
    ["same-name local import", 'import { fetch } from "./local"; fetch();', 0],
    ["local constant", "const fetch = () => {}; fetch();", 0],
    ["local function", "function fetch() {} fetch();", 0],
    [
      "block-local fetch",
      '{ const fetch = () => {}; fetch(); } fetch("/global");',
      1,
    ],
    [
      "nested function fetch",
      'function nested() { function fetch() {} fetch(); } fetch("/global");',
      1,
    ],
    [
      "hoisted function binding",
      'function nested() { fetch(); function fetch() {} } fetch("/global");',
      1,
    ],
    [
      "function parameter",
      'function nested(fetch: () => void) { fetch(); } fetch("/global");',
      1,
    ],
    [
      "block-local globalThis",
      '{ const globalThis = { fetch: () => {} }; globalThis.fetch(); } globalThis.fetch("/global");',
      1,
    ],
    [
      "globalThis parameter",
      'function nested(globalThis: { fetch(): void }) { globalThis.fetch(); } globalThis.fetch("/global");',
      1,
    ],
    [
      "global alias and block shadow",
      'const request = globalThis.fetch; { const request = () => {}; request(); } request("/global");',
      1,
    ],
    [
      "global alias and function shadow",
      'const request = globalThis.fetch; function nested(request: () => void) { request(); } request("/global");',
      1,
    ],
    [
      "block alias cannot contaminate outer binding",
      'const request = () => {}; { const request = globalThis.fetch; request("/global"); } request();',
      1,
    ],
    [
      "alias of local fetch",
      "const fetch = () => {}; const request = fetch; request();",
      0,
    ],
    [
      "alias of local globalThis",
      "const globalThis = { fetch: () => {} }; const request = globalThis.fetch; request();",
      0,
    ],
    [
      "undici alias and block shadow",
      'import { fetch as request } from "undici"; { const request = () => {}; request(); } request("/global");',
      1,
    ],
    [
      "undici alias and parameter shadow",
      'import { fetch as request } from "undici"; function nested(request: () => void) { request(); } request("/global");',
      1,
    ],
    [
      "comments cannot introduce bindings",
      '/* const fetch = () => {}; */ fetch("/global");',
      1,
    ],
    [
      "strings cannot introduce fetch aliases",
      'const note = "const request = globalThis.fetch"; const request = () => {}; request();',
      0,
    ],
  ])("resolves lexical fetch scope: %s", async (_name, source, expected) => {
    using fixture = createFixtureRepository({
      "src/local.ts": "export const fetch = () => {};",
      "src/request.ts": `${source}\nexport {};`,
    });
    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });
    expect(
      result.findings.filter((finding) => finding.rule === "direct-fetch"),
    ).toHaveLength(expected);
  });

  it("uses consumer ambient fetch declarations with no DOM library", async () => {
    using fixture = createFixtureRepository({
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          lib: ["ES2022"],
          module: "ESNext",
          moduleResolution: "Bundler",
          target: "ES2022",
        },
        include: ["src/**/*.ts"],
      }),
      "src/runtime.d.ts":
        "export {}; declare global { function fetch(url: string): unknown; }",
      "src/request.ts":
        'export {}; fetch("/global"); function nested(fetch: () => void) { fetch(); }',
    });
    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });
    expect(
      result.findings.filter((finding) => finding.rule === "direct-fetch"),
    ).toHaveLength(1);
  });

  it.each([
    [
      "global variable",
      "export {}; declare global { var fetch: (url: string) => unknown; }",
    ],
    ["script global variable", "declare var fetch: (url: string) => unknown;"],
    [
      "global function merged with namespace",
      "export {}; declare global { function fetch(url: string): unknown; namespace fetch { const version: string; } }",
    ],
  ])("recognizes consumer ambient fetch: %s", async (_name, declaration) => {
    using fixture = createFixtureRepository({
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          lib: ["ES2022"],
          module: "ESNext",
          moduleResolution: "Bundler",
          target: "ES2022",
        },
        include: ["src/**/*.ts"],
      }),
      "src/runtime.d.ts": declaration,
      "src/direct.ts": 'export {}; fetch("/global");',
      "src/alias.ts": 'export {}; const request = fetch; request("/alias");',
      "src/local.ts": [
        "export {};",
        "declare const fetch: () => void;",
        "fetch(); const request = fetch; request();",
      ].join("\n"),
      "src/shadow.ts": [
        "export {};",
        "function nested() { var fetch = () => {}; fetch(); const request = fetch; request(); }",
      ].join("\n"),
    });
    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });
    expect(result.findings).toEqual([
      expect.objectContaining({ path: "src/alias.ts", rule: "direct-fetch" }),
      expect.objectContaining({ path: "src/direct.ts", rule: "direct-fetch" }),
    ]);
  });

  it("resolves fetch bindings at each call site", async () => {
    using fixture = createFixtureRepository({
      "src/api/server/transport.ts":
        "export const request = () => undefined;\n",
      "src/features/news/local.ts": "export const fetch = () => undefined;\n",
      "src/features/news/request.ts": [
        'import { fetch as localFetch } from "./local";',
        'import { fetch as undiciFetch } from "undici";',
        "const http = globalThis.fetch;",
        "const scoped = (fetch: () => void) => fetch();",
        'fetch("/global");',
        'globalThis.fetch("/global-this");',
        "localFetch();",
        'undiciFetch("/undici");',
        'http("/alias");',
        "void scoped;",
      ].join("\n"),
    });
    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });
    expect(
      result.findings.filter((finding) => finding.rule === "direct-fetch"),
    ).toHaveLength(4);
  });
});

describe("API-boundary bypass resistance", () => {
  it("scans tracked JavaScript and reports browser fetch variants", async () => {
    using fixture = createFixtureRepository({
      "src/features/news/bypass.js": [
        'window.fetch("/window");',
        'self.fetch("/self");',
        'globalThis["fetch"]("/global-this");',
      ].join("\n"),
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });

    expect(
      result.findings.filter(
        (value) =>
          value.path === "src/features/news/bypass.js" &&
          value.rule === "direct-fetch",
      ),
    ).toHaveLength(3);
  });

  it("scans tracked source even when the consumer tsconfig excludes it", async () => {
    using fixture = createFixtureRepository({
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          target: "ES2022",
        },
        include: ["src/client-entry.tsx"],
      }),
      "src/features/news/excluded.ts": 'fetch("/not-in-tsconfig");',
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        path: "src/features/news/excluded.ts",
        rule: "direct-fetch",
      }),
    );
  });

  it("resolves aliases from a JSONC tsconfig", async () => {
    using fixture = createFixtureRepository({
      "tsconfig.json": [
        "{",
        "  // Consumer configs may use comments.",
        '  "compilerOptions": {',
        '    "baseUrl": ".",',
        '    "paths": { "@/*": ["src/*"] }',
        "  },",
        '  "include": ["src/**/*.ts", "src/**/*.tsx"]',
        "}",
      ].join("\n"),
      "src/features/news/request.ts": [
        'import { request } from "@/api/server/transport";',
        "void request;",
      ].join("\n"),
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        path: "src/features/news/request.ts",
        rule: "transport-boundary",
      }),
    );
  });

  it("blocks CommonJS imports of server-only API code from a client entry", async () => {
    using fixture = createFixtureRepository({
      "src/api/server/private-client.ts": "export const privateClient = {};\n",
      "src/client-entry.tsx": [
        '"use client";',
        'const { privateClient } = require("./api/server/private-client");',
        "void privateClient;",
      ].join("\n"),
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        path: "src/client-entry.tsx",
        rule: "client-server-import",
      }),
    );
  });

  it("blocks CommonJS imports of the approved transport outside the server API root", async () => {
    using fixture = createFixtureRepository({
      "src/features/news/request.ts": [
        'const { request } = require("../../api/server/transport");',
        "void request;",
      ].join("\n"),
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        path: "src/features/news/request.ts",
        rule: "transport-boundary",
      }),
    );
  });

  it("blocks direct calls through a known HTTP client", async () => {
    using fixture = createFixtureRepository({
      "src/features/news/request.ts": [
        'import ky from "ky";',
        'void ky.get("/api/news");',
      ].join("\n"),
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        path: "src/features/news/request.ts",
        rule: "direct-fetch",
      }),
    );
  });

  it("blocks a client import of physically present ignored generated SDK code", async () => {
    using fixture = createFixtureRepository({
      ".gitignore": "src/api/generated/\n",
      "src/api/generated/client.ts": "export const generatedClient = {};\n",
      "src/client-entry.tsx": [
        '"use client";',
        'import { generatedClient } from "./api/generated/client";',
        "void generatedClient;",
      ].join("\n"),
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        path: "src/client-entry.tsx",
        rule: "client-server-import",
      }),
    );
  });

  it("follows a reachable local production module outside sourceRoot", async () => {
    using fixture = createFixtureRepository({
      "lib/unsanctioned.ts": 'export const load = () => fetch("/outside");\n',
      "src/features/news/request.ts": [
        'import { load } from "../../../lib/unsanctioned";',
        "void load;",
      ].join("\n"),
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        path: "lib/unsanctioned.ts",
        rule: "direct-fetch",
      }),
    );
  });

  it("protects every server API root while allowing its internal transport path", async () => {
    using fixture = createFixtureRepository({
      "src/app/api/route.ts": [
        'import { load } from "../../shared/api/server/service";',
        "void load;",
      ].join("\n"),
      "src/app/api/transport.ts":
        'export const request = () => fetch("/api");\n',
      "src/features/news/request.ts": [
        'import { load } from "../../shared/api/server/service";',
        "void load;",
      ].join("\n"),
      "src/shared/api/server/service.ts": [
        'import { request } from "../../../app/api/transport";',
        "export const load = request;",
      ].join("\n"),
      "src/shared/api/server/manual.ts": "export const unsafe: any = {};\n",
      "src/client-entry.tsx": [
        '"use client";',
        'import { load } from "./shared/api/server/service";',
        "void load;",
      ].join("\n"),
    });
    const config = {
      ...apiBoundariesConfig,
      serverApiRoots: ["src/app/api", "src/shared/api/server"],
      transportFiles: ["src/app/api/transport.ts"],
    };

    const result = await runApiBoundariesCheck(config, { cwd: fixture.path });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        path: "src/client-entry.tsx",
        rule: "client-server-import",
      }),
    );
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        path: "src/features/news/request.ts",
        rule: "transport-boundary",
      }),
    );
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        path: "src/shared/api/server/manual.ts",
        rule: "manual-api-type",
      }),
    );
    expect(result.findings).not.toContainEqual(
      expect.objectContaining({
        path: "src/app/api/route.ts",
        rule: "transport-boundary",
      }),
    );
    expect(result.findings).not.toContainEqual(
      expect.objectContaining({
        path: "src/shared/api/server/service.ts",
        rule: "transport-boundary",
      }),
    );
  });

  it("allows transport only in explicitly listed server API files", async () => {
    using fixture = createFixtureRepository({
      "src/app/api/route.ts": [
        'import { request } from "./transport";',
        "export const proxy = request;",
      ].join("\n"),
      "src/app/api/transport.ts": "export const request = () => undefined;\n",
      "src/shared/api/server/service.ts": [
        'import { request } from "../../../app/api/transport";',
        "export const load = request;",
      ].join("\n"),
      "src/shared/api/server/unsafe.ts": [
        'import { request } from "../../../app/api/transport";',
        "export const bypass = request;",
      ].join("\n"),
      "src/client-entry.tsx": [
        '"use client";',
        'import { load } from "./shared/api/server/service";',
        "void load;",
      ].join("\n"),
    });
    const config = {
      ...apiBoundariesConfig,
      serverApiFiles: [
        "src/app/api/route.ts",
        "src/shared/api/server/service.ts",
      ],
      serverApiRoots: [],
      transportFiles: ["src/app/api/transport.ts"],
    };

    const result = await runApiBoundariesCheck(config, { cwd: fixture.path });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        path: "src/shared/api/server/unsafe.ts",
        rule: "transport-boundary",
      }),
    );
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        path: "src/client-entry.tsx",
        rule: "client-server-import",
      }),
    );
    expect(result.findings).not.toContainEqual(
      expect.objectContaining({
        path: "src/app/api/route.ts",
        rule: "transport-boundary",
      }),
    );
  });

  it("blocks callable CommonJS HTTP clients without flagging helpers", async () => {
    using fixture = createFixtureRepository({
      "src/features/news/request.ts": [
        'import { isAxiosError as isAxiosFailure } from "axios";',
        'const { get } = require("axios");',
        'const ky = require("ky").default;',
        'const { isAxiosError } = require("axios");',
        'get("/api/news");',
        'ky.get("/api/news");',
        'require("axios").get("/api/inline");',
        "isAxiosError(new Error());",
        "isAxiosFailure(new Error());",
      ].join("\n"),
    });

    const result = await runApiBoundariesCheck(apiBoundariesConfig, {
      cwd: fixture.path,
    });

    expect(
      result.findings.filter(
        (value) =>
          value.path === "src/features/news/request.ts" &&
          value.rule === "direct-fetch",
      ),
    ).toHaveLength(3);
  });
});

describe("insta-lints api-boundaries", () => {
  it("exits 1 for an unauthorized package API client import", async () => {
    using fixture = createFixtureRepository({
      "api-boundaries.config.json": JSON.stringify({
        ...apiBoundariesConfig,
        transportPackageSpecifiers: ["@newstartby/api/transport"],
      }),
      "src/features/client.ts": [
        'import { createApiClient } from "@newstartby/api/transport";',
        "void createApiClient;",
      ].join("\n"),
    });

    const result = await runCli(fixture.path, [
      "api-boundaries",
      "--config",
      "api-boundaries.config.json",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("transport-boundary");
    expect(result.stderr).toContain("src/features/client.ts");
  });

  it("exits 0 for an authorized server API client adapter", async () => {
    using fixture = createFixtureRepository({
      "api-boundaries.config.json": JSON.stringify({
        ...apiBoundariesConfig,
        transportPackageSpecifiers: ["@newstartby/api/transport"],
      }),
      "src/api/server/adapter.ts": [
        'import { createApiClient } from "@newstartby/api/transport";',
        "void createApiClient;",
      ].join("\n"),
    });

    const result = await runCli(fixture.path, [
      "api-boundaries",
      "--config",
      "api-boundaries.config.json",
    ]);
    expect(result.exitCode).toBe(0);
  });

  it("reports findings as errors and exits 1", async () => {
    using fixture = createFixtureRepository({
      "api-boundaries.config.json": JSON.stringify(apiBoundariesConfig),
      "src/client-entry.tsx": '"use client";\nfetch("/api/news");\n',
    });

    const result = await runCli(fixture.path, [
      "api-boundaries",
      "--config",
      "api-boundaries.config.json",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("direct-fetch");
  });

  it("rejects scoped exceptions without an exact path, reason, and allowed rule", async () => {
    using fixture = createFixtureRepository({
      "api-boundaries.config.json": JSON.stringify({
        ...apiBoundariesConfig,
        scopedExceptionFiles: [
          { allowedRules: [], path: "src/integrations/*.ts", reason: "" },
        ],
      }),
    });

    const result = await runCli(fixture.path, [
      "api-boundaries",
      "--config",
      "api-boundaries.config.json",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("scopedExceptionFiles");
  });

  it("fails closed for missing required arrays, whitespace, and nonexistent configured files", async () => {
    using fixture = createFixtureRepository({
      "api-boundaries.config.json": JSON.stringify({
        clientEntryFiles: ["  "],
        generatedRoot: "src/api/generated",
        serverApiRoots: ["src/api/server"],
        sourceRoot: "src",
      }),
    });

    const result = await runCli(fixture.path, [
      "api-boundaries",
      "--config",
      "api-boundaries.config.json",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("clientEntryFiles");
  });

  it("exits 1 for client-server import findings", async () => {
    using fixture = createFixtureRepository({
      "api-boundaries.config.json": JSON.stringify(apiBoundariesConfig),
      "src/api/server/client.ts": "export const serverClient = {};\n",
      "src/client-entry.tsx":
        '"use client";\nimport { serverClient } from "./api/server/client";\nvoid serverClient;\n',
    });

    const result = await runCli(fixture.path, [
      "api-boundaries",
      "--config",
      "api-boundaries.config.json",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("client-server-import");
  });

  it("reports checker execution errors without calling them config-read errors", async () => {
    using fixture = createFixtureRepository({
      "api-boundaries.config.json": JSON.stringify(apiBoundariesConfig),
      "src/client-entry.tsx": '"use client";\n',
      "tsconfig.json": "not JSON",
    });
    const result = await runCli(fixture.path, [
      "api-boundaries",
      "--config",
      "api-boundaries.config.json",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("ошибка проверки");
  });
});

it("reports transport access through the most specific alias despite a safe broad alias", async () => {
  using fixture = createFixtureRepository({
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        paths: { "*": ["./src/safe.ts"], "@api/*": ["./src/api/server/*"] },
      },
    }),
    "src/safe.ts": "export const request = () => undefined;",
    "src/consumer.ts":
      'import { request } from "@api/transport"; void request;',
  });
  const result = await runApiBoundariesCheck(apiBoundariesConfig, {
    cwd: fixture.path,
  });
  expect(result.findings).toContainEqual(
    expect.objectContaining({
      path: "src/consumer.ts",
      rule: "transport-boundary",
    }),
  );
});
