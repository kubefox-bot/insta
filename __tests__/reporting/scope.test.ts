import { expect, test } from "bun:test";
import { createPhaseTargets } from "../../scripts/testing/phases/plan";

test("Core discovery excludes Stories while Full retains every existing owner", async () => {
  const core = await createPhaseTargets({
    dockerPrefix: ["docker"],
    includeSourceChecks: false,
    scope: "core",
  });
  const full = await createPhaseTargets({
    dockerPrefix: ["docker"],
    includeSourceChecks: false,
    scope: "full",
  });
  const corePaths = new Set(core.flatMap((target) => target.paths));
  const fullPaths = new Set(full.flatMap((target) => target.paths));
  const overlayPath = "__tests__/e2e/conversations/marks-story-overlay.spec.ts";
  expect(corePaths.has(overlayPath)).toBe(false);
  expect(fullPaths.has(overlayPath)).toBe(true);
  expect(
    corePaths.has("__tests__/e2e/conversations/message-marks.spec.ts"),
  ).toBe(true);
  expect(corePaths.has("__tests__/integration/stories/storage.test.ts")).toBe(
    false,
  );
  expect(fullPaths.has("__tests__/integration/stories/storage.test.ts")).toBe(
    true,
  );
  expect([...corePaths].sort()).toEqual(
    [...fullPaths]
      .filter((path) => !path.includes("/stories/") && path !== overlayPath)
      .sort(),
  );
  expect(corePaths.size).toBeGreaterThan(20);
});

test("scope filtering preserves unknown Core owners and excludes only owned Stories paths in all phases", async () => {
  const { selectScopePaths } = await import(
    "../../scripts/testing/phases/scope"
  );
  const paths = [
    "__tests__/integration/stories/storage.test.ts",
    "__tests__/abuse/stories/future.test.ts",
    "__tests__/e2e/stories/future.spec.ts",
    "__tests__/integration/users/new.test.ts",
    "__tests__/abuse/stories-like/new.test.ts",
    "__tests__/e2e/conversations/new.spec.ts",
  ];
  expect(selectScopePaths({ paths, scope: "core" })).toEqual(paths.slice(3));
  expect(selectScopePaths({ paths, scope: "full" })).toEqual(paths);
});
