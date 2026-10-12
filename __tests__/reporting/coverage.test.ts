import { expect, test } from "bun:test";
import {
  requiredScenarioParts,
  scenarioOwners,
  verifyCoverage,
} from "../../scripts/testing/scenarios/index";

test("core enrollment covers exactly required parts and excludes deferred stories", () => {
  const result = verifyCoverage({ scope: "core", owners: scenarioOwners });
  expect([...result.coveredScenarioParts].sort()).toEqual(
    [...requiredScenarioParts("core")].sort(),
  );
  expect(result.errors).toEqual([]);
  expect(requiredScenarioParts("core")).not.toContain("E10:media");
});
test("missing core auth or chat owner fails coverage but missing stories does not fail core", () => {
  for (const part of ["E02:registration", "E05:chat"]) {
    const owners = scenarioOwners.filter((owner) => owner.key !== part);
    expect(verifyCoverage({ scope: "core", owners }).errors).toContain(
      `Missing required owner: ${part}`,
    );
  }
  expect(
    verifyCoverage({ scope: "core", owners: scenarioOwners }).errors,
  ).toEqual([]);
  expect(
    verifyCoverage({
      scope: "full",
      owners: scenarioOwners.filter((owner) => owner.key !== "E10:media"),
    }).errors,
  ).toContain("Missing required owner: E10:media");
});
test("duplicate primary owners and empty selectors cannot disguise uncovered parts", () => {
  const first = scenarioOwners[0];
  if (!first) throw new Error("Expected enrolled owner");
  expect(
    verifyCoverage({ scope: "core", owners: [...scenarioOwners, first] })
      .errors,
  ).toContain(`Duplicate primary owner: ${first.key}`);
  expect(
    verifyCoverage({ scope: "core", owners: [{ ...first, paths: [] }] }).errors,
  ).toContain(`Empty owner selector: ${first.key}`);
});
test("every enrolled selector is a existing owned test file", async () => {
  for (const owner of scenarioOwners)
    for (const path of owner.paths)
      expect(await Bun.file(path).exists()).toBe(true);
});

test("full enrolls all media owners", () => {
  expect(
    verifyCoverage({ scope: "full", owners: scenarioOwners }).errors,
  ).toEqual([]);
});
