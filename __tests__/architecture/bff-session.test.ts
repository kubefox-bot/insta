import { expect, test } from "bun:test";
import { runModuleBoundariesCheck } from "@insta/fe-core/lints";
import { repository } from "./fixtures/repository";

const config = await Bun.file(
  new URL("../../apps/fe-insta/module-boundaries.config.json", import.meta.url),
).json();
const base = {
  "apps/fe-insta/src/lib/session/server/index.ts":
    'export { resolve } from "./use-cases/resolve";',
  "apps/fe-insta/src/lib/session/server/use-cases/resolve.ts":
    "export const resolve=()=>true;",
  "apps/fe-insta/src/lib/session/server/adapters/mongo/store.ts":
    "export const store=()=>true;",
};
test("session public server boundary accepts composition and rejects private access and outward dependencies", async () => {
  using valid = repository({
    ...base,
    "apps/fe-insta/src/app/users/server/session/create.ts":
      'import "../../../../lib/session/server/index";',
  });
  expect(
    (await runModuleBoundariesCheck(config, { cwd: valid.path })).findings,
  ).toEqual([]);
  for (const [path, source] of [
    [
      "apps/fe-insta/src/app/users/server/session/create.ts",
      'import "../../../../lib/session/server/adapters/mongo/store";',
    ],
    [
      "apps/fe-insta/src/lib/session/server/use-cases/resolve.ts",
      'import "../adapters/mongo/store";',
    ],
    [
      "apps/fe-insta/src/lib/session/server/domain/policy.ts",
      'import "../adapters/mongo/store";',
    ],
  ] as const) {
    using invalid = repository({ ...base, [path]: source });
    expect(
      (await runModuleBoundariesCheck(config, { cwd: invalid.path })).findings
        .length,
    ).toBeGreaterThan(0);
  }
});

test("session cookie-only public API accepts Users load and protects cookie implementation", async () => {
  const cookies = {
    ...base,
    "apps/fe-insta/src/lib/session/server/cookies.ts":
      'export { sessionCookieName } from "./conts";',
    "apps/fe-insta/src/lib/session/server/conts.ts":
      'export const sessionCookieName = "synthetic";',
  };
  using publicConsumer = repository({
    ...cookies,
    "apps/fe-insta/src/domains/users/server/load-session.ts":
      'import { sessionCookieName } from "../../../lib/session/server/cookies"; export const read = () => sessionCookieName;',
  });
  expect(
    (await runModuleBoundariesCheck(config, { cwd: publicConsumer.path }))
      .findings,
  ).toEqual([]);

  using privateConsumer = repository({
    ...cookies,
    "apps/fe-insta/src/domains/users/server/load-session.ts":
      'import { sessionCookieName } from "../../../lib/session/server/conts"; export const read = () => sessionCookieName;',
  });
  expect(
    (
      await runModuleBoundariesCheck(config, { cwd: privateConsumer.path })
    ).findings.map((finding) => finding.rule),
  ).toContain("private-module-import");
});
