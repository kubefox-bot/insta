import { expect, it } from "bun:test";
import {
  type ModuleBoundariesConfig,
  runModuleBoundariesCheck,
} from "@insta/fe-core/lints";
import { repository } from "./fixtures/repository.ts";

const config = {
  sourceRoot: ".",
  layers: [
    { name: "packages", root: "packages", allow: [] },
    { name: "domains", root: "apps/fe/src/domains", allow: ["packages"] },
    { name: "lib", root: "apps/fe/src/lib", allow: ["packages"] },
    {
      name: "app",
      root: "apps/fe/src/app",
      allow: ["domains", "lib", "packages"],
    },
  ],
  moduleGroups: [
    {
      root: "apps/fe/src/domains",
      publicEntrypoints: ["browser/index.ts", "server/index.ts"],
      forbidCycles: true,
    },
    {
      root: "packages",
      publicEntrypoints: [
        "browser/index.ts",
        "server/index.ts",
        "types/index.ts",
      ],
      forbidCycles: true,
    },
  ],
  forbiddenDependencies: [
    {
      source: "apps/*/src/domains/*/domain/**",
      target: "apps/*/src/domains/*/adapters/**",
    },
    {
      source: "apps/*/src/domains/*/use-cases/**",
      target: "apps/*/src/domains/*/adapters/**",
    },
    { source: "packages/contracts/**", target: "apps/**" },
  ],
} satisfies ModuleBoundariesConfig;
const base = {
  "packages/contracts/package.json": JSON.stringify({
    name: "@insta/contracts",
    exports: { "./types": "./types/index.ts", "./server": "./server/index.ts" },
  }),
  "packages/contracts/types/index.ts":
    "export type Message = Readonly<{ text: string }>;",
  "packages/contracts/server/index.ts":
    'export { request } from "./generated.ts";',
  "packages/contracts/server/generated.ts":
    'export const request = () => "fixture";',
  "apps/fe/src/domains/users/browser/index.ts":
    'export { value } from "../lib/value.ts";',
  "apps/fe/src/domains/users/lib/value.ts": "export const value = 1;",
  "apps/fe/src/domains/users/ports/storage/interfaces.ts":
    "export type Storage = Readonly<{ read: () => string }>;",
  "apps/fe/src/domains/users/adapters/storage.ts":
    'export const read = () => "fixture";',
};
it("accepts domain→port, local domain/component lib, composition→adapter, and package public subpaths", async () => {
  using fixture = repository({
    ...base,
    "apps/fe/src/domains/users/domain/read.ts":
      'import type { Storage } from "../ports/storage/interfaces.ts"; import type { Message } from "@insta/contracts/types";',
    "apps/fe/src/domains/users/server/index.ts":
      'export { read } from "../adapters/storage.ts";',
    "apps/fe/src/domains/users/components/Player/lib/title.ts":
      'export const title = "fixture";',
    "apps/fe/src/domains/users/components/Player/index.svelte":
      '<script>import { title } from "./lib/title.ts";</script><p>{title}</p>',
    "apps/fe/src/app/compose.ts":
      'import { read } from "../domains/users/server/index.ts";',
  });
  expect(
    (await runModuleBoundariesCheck(config, { cwd: fixture.path })).findings,
  ).toEqual([]);
});
for (const [name, source, rule] of [
  [
    "apps/fe/src/lib/time/read.ts",
    'import { value } from "../../domains/users/lib/value.ts";',
    "layer-dependency",
  ],
  [
    "packages/contracts/types/read.ts",
    'import "../../../apps/fe/src/app/compose.ts";',
    "layer-dependency",
  ],
  [
    "apps/fe/src/domains/users/domain/read.ts",
    'import "../adapters/storage.ts";',
    "forbidden-dependency",
  ],
  [
    "apps/fe/src/domains/users/use-cases/read.ts",
    'import "../adapters/storage.ts";',
    "forbidden-dependency",
  ],
  [
    "apps/fe/src/app/read.ts",
    'import "@insta/contracts/server/generated.ts";',
    "private-module-import",
  ],
] as const) {
  it(`rejects ${name} ${rule}`, async () => {
    using fixture = repository({
      ...base,
      "apps/fe/src/app/compose.ts": "export const compose = 1;",
      [name]: source,
    });
    expect(
      (
        await runModuleBoundariesCheck(config, { cwd: fixture.path })
      ).findings.map((value) => value.rule),
    ).toContain(rule);
  });
}

it("rejects contracts importing the backend generated SDK implementation", async () => {
  using fixture = repository({
    ...base,
    "packages/contracts/server/generated.ts":
      'import "../../../apps/be/src/app/generated/sdk.ts";',
    "apps/be/src/app/generated/sdk.ts": "export const sdk = 1;",
  });
  const configured = {
    ...config,
    layers: [
      ...config.layers,
      { name: "backend", root: "apps/be", allow: ["packages"] },
    ],
  };
  expect(
    (
      await runModuleBoundariesCheck(configured, { cwd: fixture.path })
    ).findings.map((value) => value.rule),
  ).toContain("layer-dependency");
});

it("enrolls infra imports through the backend and frontend public entries", async () => {
  const infrastructureConfig = (await Bun.file(
    new URL("../../module-boundaries.config.json", import.meta.url),
  ).json()) as ModuleBoundariesConfig;
  const infrastructureFiles = {
    "apps/be-insta/src/lib/dragonfly/bootstrap.ts":
      "export const bootstrapGeneration = () => undefined;",
    "apps/be-insta/src/lib/dragonfly/index.ts":
      'export { bootstrapGeneration } from "./bootstrap";',
    "apps/fe-insta/src/lib/observability/client/conts.ts":
      'export const faroProtocol = "faro-json-v1";',
    "apps/fe-insta/src/lib/observability/client/schema.ts":
      "export const safeFaroBodySchema = {};",
    "apps/fe-insta/src/lib/observability/client/index.ts":
      'export { faroProtocol } from "./conts"; export { safeFaroBodySchema } from "./schema";',
  };
  using publicFixture = repository({
    ...infrastructureFiles,
    "infra/dragonfly/bootstrap.ts":
      'import { bootstrapGeneration } from "../../apps/be-insta/src/lib/dragonfly/index"; void bootstrapGeneration;',
    "infra/otel/receiver.ts":
      'import { faroProtocol, safeFaroBodySchema } from "../../apps/fe-insta/src/lib/observability/client/index"; void faroProtocol; void safeFaroBodySchema;',
  });
  expect(
    (
      await runModuleBoundariesCheck(infrastructureConfig, {
        cwd: publicFixture.path,
      })
    ).findings,
  ).toEqual([]);

  for (const [name, source] of [
    [
      "infra/dragonfly/bootstrap.ts",
      'import { bootstrapGeneration } from "../../apps/be-insta/src/lib/dragonfly/bootstrap"; void bootstrapGeneration;',
    ],
    [
      "infra/otel/receiver.ts",
      'import { faroProtocol } from "../../apps/fe-insta/src/lib/observability/client/conts"; void faroProtocol;',
    ],
    [
      "infra/otel/receiver.ts",
      'import { safeFaroBodySchema } from "../../apps/fe-insta/src/lib/observability/client/schema"; void safeFaroBodySchema;',
    ],
  ] as const) {
    using privateFixture = repository({
      ...infrastructureFiles,
      [name]: source,
    });
    expect(
      (
        await runModuleBoundariesCheck(infrastructureConfig, {
          cwd: privateFixture.path,
        })
      ).findings.map((finding) => finding.rule),
    ).toContain("forbidden-dependency");
  }
});
