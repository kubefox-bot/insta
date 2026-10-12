import { expect, test } from "bun:test";
import { validateCoreEnvironment } from "../../scripts/testing/environment/core";
import { storiesEnvironmentKeys } from "../../scripts/testing/stories/conts";
import { validateStoryRuntime } from "../../scripts/testing/stories/runtime";

test("running Stories mode, user, storage settings and zero mounts must agree with the reviewed profile", () => {
  const expected = {
    [storiesEnvironmentKeys.mode]: "enabled",
    [storiesEnvironmentKeys.activeProfile]: "local",
    [storiesEnvironmentKeys.profiles]: "synthetic-storage",
  };
  const actual = {
    user: "bun",
    environment: Object.entries(expected).map(
      ([key, value]) => `${key}=${value}`,
    ),
    mounts: [],
  };
  expect(() => validateStoryRuntime({ actual, expected })).not.toThrow();
  for (const changed of [
    { ...actual, user: "root" },
    { ...actual, mounts: [{ destination: "/foreign" }] },
    { ...actual, environment: ["STORIES_MODE=disabled"] },
    {
      ...actual,
      environment: actual.environment.map((value) =>
        value.replace("synthetic-storage", "different-storage"),
      ),
    },
  ])
    expect(() => validateStoryRuntime({ actual: changed, expected })).toThrow();
});

test("Core requires disabled actual applications and effective testhost mode", () => {
  const disabled = {
    applications: {
      "be-insta": ["STORIES_MODE=disabled"],
      "fe-insta": ["STORIES_MODE=disabled"],
    },
    testhost: {
      imageEnvironment: ["STORIES_MODE=enabled"],
      environment: { [storiesEnvironmentKeys.mode]: "disabled" },
    },
  };
  expect(() => validateCoreEnvironment(disabled)).not.toThrow();
  expect(() =>
    validateCoreEnvironment({
      applications: { "be-insta": [], "fe-insta": [] },
      testhost: { imageEnvironment: [], environment: {} },
    }),
  ).not.toThrow();
  expect(() =>
    validateCoreEnvironment({
      ...disabled,
      testhost: {
        ...disabled.testhost,
        environment: { [storiesEnvironmentKeys.mode]: null },
      },
    }),
  ).not.toThrow();
  for (const mode of ["enabled", "invalid", ""]) {
    for (const service of ["be-insta", "fe-insta"])
      expect(() =>
        validateCoreEnvironment({
          ...disabled,
          applications: {
            ...disabled.applications,
            [service]: [`STORIES_MODE=${mode}`],
          },
        }),
      ).toThrow();
    expect(() =>
      validateCoreEnvironment({
        ...disabled,
        testhost: {
          ...disabled.testhost,
          environment: { [storiesEnvironmentKeys.mode]: mode },
        },
      }),
    ).toThrow();
    expect(() =>
      validateCoreEnvironment({
        ...disabled,
        testhost: {
          imageEnvironment: [`STORIES_MODE=${mode}`],
          environment: {},
        },
      }),
    ).toThrow();
  }
  for (const malformed of [
    {},
    { ...disabled, applications: { "be-insta": [] } },
    { ...disabled, testhost: { environment: {} } },
  ])
    expect(() => validateCoreEnvironment(malformed)).toThrow();
});
