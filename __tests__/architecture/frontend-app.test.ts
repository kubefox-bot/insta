import { expect, test } from "bun:test";
import { runModuleBoundariesCheck } from "@insta/fe-core/lints";
import config from "../../apps/fe-insta/module-boundaries.config.json";
import { repository } from "./fixtures/repository";

const scaffold = {
  "apps/fe-insta/src/app/users/server/index.ts":
    'export { create } from "./create";',
  "apps/fe-insta/src/app/users/server/create.ts":
    "export const create = () => true;",
  "apps/fe-insta/src/app/shell/browser/index.ts":
    'export { Shell } from "./create";',
  "apps/fe-insta/src/app/shell/browser/create.ts": "export const Shell = 1;",
  "apps/fe-insta/src/domains/users/browser/index.ts": "export const auth = 1;",
};

test("app public browser/server APIs permit route composition and protect private implementation", async () => {
  using valid = repository({
    ...scaffold,
    "apps/fe-insta/src/routes/+layout.ts":
      'import { Shell } from "../app/shell/browser/index"; export const shell = Shell;',
    "apps/fe-insta/src/app/http/server/create.ts":
      'import { create } from "../../users/server/index"; export const request = create;',
  });
  expect(
    (await runModuleBoundariesCheck(config, { cwd: valid.path })).findings,
  ).toEqual([]);
  for (const source of [
    'import "../app/shell/browser/create";',
    'import "../app/users/server/create";',
  ]) {
    using invalid = repository({
      ...scaffold,
      "apps/fe-insta/src/routes/+layout.ts": source,
    });
    expect(
      (
        await runModuleBoundariesCheck(config, { cwd: invalid.path })
      ).findings.map((value) => value.rule),
    ).toContain("private-module-import");
  }
});

test("shared components cannot regain application or domain ownership", async () => {
  for (const source of [
    'import "../../app/shell/browser/index";',
    'import "../../domains/users/browser/index";',
  ]) {
    using fixture = repository({
      ...scaffold,
      "apps/fe-insta/src/shared/components/header.ts": source,
    });
    expect(
      (
        await runModuleBoundariesCheck(config, { cwd: fixture.path })
      ).findings.map((value) => value.rule),
    ).toContain("layer-dependency");
  }
});

test("app composition owners reject cyclic public dependencies", async () => {
  using fixture = repository({
    ...scaffold,
    "apps/fe-insta/src/app/users/server/create.ts":
      'import "../../http/server/index"; export const create = () => true;',
    "apps/fe-insta/src/app/http/server/index.ts":
      'import "../../users/server/index"; export const request = 1;',
  });
  expect(
    (
      await runModuleBoundariesCheck(config, { cwd: fixture.path })
    ).findings.map((value) => value.rule),
  ).toContain("module-cycle");
});
