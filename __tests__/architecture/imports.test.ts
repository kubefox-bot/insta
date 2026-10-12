import { expect, it } from "bun:test";
import {
  type ModuleBoundariesConfig,
  runModuleBoundariesCheck,
} from "@insta/fe-core/lints";
import { repository } from "./fixtures/repository.ts";

const config = {
  sourceRoot: "src",
  layers: [
    { name: "domains", root: "src/domains", allow: [] },
    { name: "app", root: "src/app", allow: ["domains"] },
  ],
  moduleGroups: [
    {
      root: "src/domains",
      publicEntrypoints: ["browser/index.ts", "server/index.ts"],
      forbidCycles: true,
    },
  ],
} satisfies ModuleBoundariesConfig;
const base = {
  "src/domains/users/browser/index.ts":
    'export { default as Player } from "../components/Player/index.svelte";',
  "src/domains/users/components/Player/index.svelte":
    '<script lang="ts">const title: string = "fixture";</script><p>{title}</p>',
  "src/domains/users/server/index.ts": 'export { secret } from "./read.ts";',
  "src/domains/users/server/read.ts":
    'export const secret = "synthetic-canary";',
};

for (const script of [
  '<script lang="ts">',
  '<script module lang="ts">',
  '<script context="module" lang="ts">',
]) {
  for (const specifier of [
    "$domains/users/server/read.ts",
    "../domains/users/server/read.ts",
  ]) {
    it(`rejects private Svelte import ${script} ${specifier}`, async () => {
      using fixture = repository({
        ...base,
        "src/app/index.svelte": `${script}import { secret } from "${specifier}";</script><p>fixture</p>`,
      });
      const result = await runModuleBoundariesCheck(config, {
        cwd: fixture.path,
      });
      expect(result.findings.map((value) => value.rule)).toContain(
        "private-module-import",
      );
    });
  }
}
it("accepts explicit Svelte component and public named re-export", async () => {
  using fixture = repository({
    ...base,
    "src/app/index.svelte":
      '<script lang="ts">import { Player } from "$domains/users/browser/index.ts";</script><Player />',
  });
  expect(
    (await runModuleBoundariesCheck(config, { cwd: fixture.path })).findings,
  ).toEqual([]);
});
it("detects cycles involving Svelte and computed imports", async () => {
  using fixture = repository({
    ...base,
    "src/domains/users/components/Player/index.svelte":
      '<script module>import "$domains/chat/browser/index.ts"; const path = "unknown"; import(path);</script><p>fixture</p>',
    "src/domains/chat/browser/index.ts":
      'export { Player } from "$domains/users/browser/index.ts";',
  });
  const rules = (
    await runModuleBoundariesCheck(config, { cwd: fixture.path })
  ).findings.map((value) => value.rule);
  expect(rules).toContain("module-cycle");
  expect(rules).toContain("dynamic-module-import");
});

it("rejects a private component imported by another domain", async () => {
  using fixture = repository({
    ...base,
    "src/domains/chat/components/View/index.svelte":
      '<script>import Player from "$domains/users/components/Player/index.svelte";</script><Player />',
  });
  expect(
    (
      await runModuleBoundariesCheck(config, { cwd: fixture.path })
    ).findings.map((value) => value.rule),
  ).toContain("private-module-import");
});
