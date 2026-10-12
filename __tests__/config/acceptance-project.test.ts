import { expect, test } from "bun:test";
import { validateAcceptanceProject } from "../../scripts/testing/environment/project";

for (const scope of ["core", "full"] as const) {
  test(`${scope} accepts only canonical or explicit scoped run-owned projects`, () => {
    expect(() =>
      validateAcceptanceProject({
        scope,
        project: scope === "core" ? "insta-core" : "insta-stories",
      }),
    ).not.toThrow();
    expect(() =>
      validateAcceptanceProject({
        scope,
        project: `insta-acceptance-${scope}-aabbccddee11`,
      }),
    ).not.toThrow();
    for (const project of [
      "insta-unknown",
      "foreign-project",
      `insta-acceptance-${scope}-`,
      `insta-acceptance-${scope}-aabbccddee11-extra`,
      "insta-acceptance-" +
        (scope === "core" ? "full" : "core") +
        "-aabbccddee11",
      scope === "core" ? "insta-stories" : "insta-core",
    ]) {
      expect(() => validateAcceptanceProject({ scope, project })).toThrow();
    }
  });
}
