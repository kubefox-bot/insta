import { expect, it } from "bun:test";
import { runModuleBoundariesCheck } from "@insta/fe-core/lints";
import workspace from "../../module-boundaries.config.json";
import core from "../../packages/fe-core/module-boundaries.config.json";
import { repository } from "../architecture/fixtures/repository.ts";

const sources = {
  "packages/fe-core/package.json": JSON.stringify({
    name: "@insta/fe-core",
    exports: { "./git/commit-message": "./src/git/commit-message/index.ts" },
  }),
  "packages/fe-core/src/git/commit-message/index.ts":
    'export { validateCommitMessage } from "./validate.ts";',
  "packages/fe-core/src/git/commit-message/validate.ts":
    "export const validateCommitMessage = () => [];",
};

it("enrolls the portable commit public subpath without allowing private imports", async () => {
  using allowed = repository({
    ...sources,
    "apps/be-insta/src/app/read.ts":
      'import { validateCommitMessage } from "@insta/fe-core/git/commit-message";',
  });
  expect(
    (await runModuleBoundariesCheck(workspace, { cwd: allowed.path })).findings,
  ).toEqual([]);
  using forbidden = repository({
    ...sources,
    "apps/be-insta/src/app/read.ts":
      'import { validateCommitMessage } from "../../../../packages/fe-core/src/git/commit-message/validate.ts";',
  });
  expect(
    (
      await runModuleBoundariesCheck(workspace, { cwd: forbidden.path })
    ).findings.map((issue) => issue.rule),
  ).toContain("private-module-import");
});

it("keeps the git capability independent from lint owners", async () => {
  using fixture = repository({
    ...sources,
    "packages/fe-core/src/git/commit-message/validate.ts":
      'import "../../architecture/check.ts";',
    "packages/fe-core/src/architecture/check.ts": "export const check = 1;",
  });
  expect(
    (await runModuleBoundariesCheck(core, { cwd: fixture.path })).findings.map(
      (issue) => issue.rule,
    ),
  ).toContain("layer-dependency");
});

it("acceptance runner consumes shared infra without importing excluded fixture sources", async () => {
  const shared = {
    "scripts/infra/docker.ts": "export const docker = async () => 'safe';",
    "__tests__/fixtures/docker.ts":
      "export { docker } from '../../scripts/infra/docker';",
  };
  using allowed = repository({
    ...shared,
    "scripts/testing/setup.ts":
      "import { docker } from '../infra/docker'; export const setup = docker;",
  });
  expect(
    (await runModuleBoundariesCheck(workspace, { cwd: allowed.path })).findings,
  ).toEqual([]);
  using forbidden = repository({
    ...shared,
    "scripts/testing/setup.ts":
      "import { docker } from '../../__tests__/fixtures/docker'; export const setup = docker;",
  });
  expect(
    (
      await runModuleBoundariesCheck(workspace, { cwd: forbidden.path })
    ).findings.map((finding) => finding.rule),
  ).toContain("unanalyzed-local-import");
});

it("continuation target port stays inward while composition consumes public conversation target reader", async () => {
  const frontend = (
    await import("../../apps/fe-insta/module-boundaries.config.json")
  ).default;
  const ports = {
    "apps/fe-insta/src/domains/auth-continuation/server/index.ts":
      "export const resume = 1;",
    "apps/fe-insta/src/domains/conversations/server/targets/index.ts":
      "export const read = 1;",
    "apps/fe-insta/src/domains/conversations/server/index.ts":
      "import { users } from '../../users/server/index'; export const conversation = users;",
    "apps/fe-insta/src/domains/users/server/index.ts":
      "import { resume } from '../../auth-continuation/server/index'; export const users = resume;",
    "apps/fe-insta/src/app/continuation/server/create.ts":
      "import { read } from '../../../domains/conversations/server/targets/index'; import { resume } from '../../../domains/auth-continuation/server/index'; export const compose = [read, resume];",
  };
  using allowed = repository(ports);
  expect(
    (await runModuleBoundariesCheck(frontend, { cwd: allowed.path })).findings,
  ).toEqual([]);
  using forbidden = repository({
    ...ports,
    "apps/fe-insta/src/domains/auth-continuation/server/index.ts":
      "import { conversation } from '../../conversations/server/index'; export const resume = conversation;",
  });
  expect(
    (
      await runModuleBoundariesCheck(frontend, { cwd: forbidden.path })
    ).findings.map((finding) => finding.rule),
  ).toContain("module-cycle");
});
