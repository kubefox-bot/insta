import { expect, test } from "bun:test";
import { runModuleBoundariesCheck } from "@insta/fe-core/lints";
import { repository } from "./fixtures/repository";

const config = await Bun.file(
  new URL("../../apps/be-insta/module-boundaries.config.json", import.meta.url),
).json();
const base = {
  "apps/be-insta/src/app/composition/users/create.ts":
    "export const createUsersDependencies=()=>true;",
  "apps/be-insta/src/app/composition/users/index.ts":
    'export {createUsersDependencies} from "./create";',
  "apps/be-insta/src/app/health/readiness/create.ts":
    "export const createInfrastructureReadiness=()=>true;",
  "apps/be-insta/src/app/health/readiness/probes/broker.ts":
    "export const checkBrokerReadiness=()=>true;",
  "apps/be-insta/src/app/health/readiness/index.ts":
    'export {createInfrastructureReadiness} from "./create";',
  "apps/be-insta/src/domains/users/domain/policy.ts":
    "export const validPassword=()=>true;",
  "apps/be-insta/src/domains/users/index.ts":
    'export {validPassword} from "./domain/policy";',
  "apps/be-insta/src/domains/users/server/index.ts":
    'export {hash} from "../adapters/passwords/hash";',
  "apps/be-insta/src/domains/users/adapters/passwords/hash.ts":
    "export const hash=()=>true;",
};
test("actual backend config accepts users public entrypoints and rejects private and inward violations", async () => {
  for (const source of [
    'import "../domains/users/server/index";',
    'import "../domains/users/index";',
    'import "./composition/users/index";',
    'import "./health/readiness/index";',
  ]) {
    using fixture = repository({
      ...base,
      "apps/be-insta/src/app/fixture.ts": source,
    });
    expect(
      (await runModuleBoundariesCheck(config, { cwd: fixture.path })).findings,
    ).toEqual([]);
  }
  for (const [path, source] of [
    [
      "apps/be-insta/src/app/fixture.ts",
      'import "./composition/users/create";',
    ],
    ["apps/be-insta/src/app/fixture.ts", 'import "./health/readiness/create";'],
    [
      "apps/be-insta/src/app/fixture.ts",
      'import "./health/readiness/probes/broker";',
    ],
    [
      "apps/be-insta/src/app/fixture.ts",
      'import "../domains/users/adapters/passwords/hash";',
    ],
    [
      "apps/be-insta/src/domains/users/domain/policy.ts",
      'import "../adapters/passwords/hash";',
    ],
    [
      "apps/be-insta/src/domains/users/use-cases/admit.ts",
      'import "../adapters/passwords/hash";',
    ],
    ["apps/be-insta/src/lib/fixture.ts", 'import "../domains/users/index";'],
  ] as const) {
    using fixture = repository({ ...base, [path]: source });
    expect(
      (await runModuleBoundariesCheck(config, { cwd: fixture.path })).findings
        .length,
    ).toBeGreaterThan(0);
  }
});
