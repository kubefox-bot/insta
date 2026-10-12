import { expect, test } from "bun:test";
import {
  readStoriesConfig,
  readStoriesMode,
} from "../../apps/be-insta/src/lib/config/stories/read";
import { readStoriesAvailability } from "../../apps/fe-insta/src/lib/config/server/stories";

const profile = {
  id: "local-v1",
  endpoint: "http://rustfs:9000",
  playbackEndpoint: "https://localhost",
  bucket: "stories",
  region: "us-east-1",
  accessKeyId: "fixture-access",
  secretAccessKey: "fixture-private-secret",
  prefix: "stories/",
};
const enabled = {
  ...Object.fromEntries([["STORIES_MODE", "enabled"]]),
  ...Object.fromEntries([["STORIES_ACTIVE_PROFILE", "local-v1"]]),
  ...Object.fromEntries([
    ["STORIES_STORAGE_PROFILES", JSON.stringify([profile])],
  ]),
};
test("Stories defaults to enabled and requires storage; Core-only mode is explicit", () => {
  expect(readStoriesMode({})).toBe("enabled");
  expect(
    readStoriesMode(Object.fromEntries([["STORIES_MODE", "disabled"]])),
  ).toBe("disabled");
  expect(() => readStoriesConfig({})).toThrow("Invalid Stories configuration");
  expect(
    readStoriesConfig(Object.fromEntries([["STORIES_MODE", "disabled"]])),
  ).toEqual({
    mode: "disabled",
  });
  expect(readStoriesAvailability({})).toBe(true);
  expect(
    readStoriesAvailability(Object.fromEntries([["STORIES_MODE", "disabled"]])),
  ).toBe(false);
  expect(readStoriesAvailability(enabled)).toBe(true);
});
test("enabled configuration retains old cleanup profiles and rejects incomplete or ambiguous identities", () => {
  expect(
    readStoriesConfig({
      ...enabled,
      ...Object.fromEntries([
        [
          "STORIES_STORAGE_PROFILES",
          JSON.stringify([
            profile,
            { ...profile, id: "old-v1", bucket: "old-stories" },
          ]),
        ],
      ]),
    }),
  ).toMatchObject({
    mode: "enabled",
    activeProfile: "local-v1",
    profiles: [{ id: "local-v1" }, { id: "old-v1" }],
  });
  for (const raw of [
    { ...Object.fromEntries([["STORIES_MODE", "enabled"]]) },
    {
      ...enabled,
      ...Object.fromEntries([["STORIES_ACTIVE_PROFILE", "missing"]]),
    },
    {
      ...enabled,
      ...Object.fromEntries([
        ["STORIES_STORAGE_PROFILES", JSON.stringify([profile, profile])],
      ]),
    },
    {
      ...enabled,
      ...Object.fromEntries([
        [
          "STORIES_STORAGE_PROFILES",
          JSON.stringify([
            { ...profile, playbackEndpoint: "http://public.example" },
          ]),
        ],
      ]),
    },
    {
      ...enabled,
      ...Object.fromEntries([
        ["STORIES_STORAGE_PROFILES", "fixture-private-secret"],
      ]),
    },
  ]) {
    expect(() => readStoriesConfig(raw)).toThrow(
      "Invalid Stories configuration",
    );
    try {
      readStoriesConfig(raw);
    } catch (error) {
      expect(String(error)).not.toContain("fixture-private-secret");
    }
  }
});

test("disabled technical composition does not construct storage clients", async () => {
  const { createStoriesInfrastructure } = await import(
    "../../apps/be-insta/src/app/composition/stories/index"
  );
  expect(
    createStoriesInfrastructure({
      config: readStoriesConfig(
        Object.fromEntries([["STORIES_MODE", "disabled"]]),
      ),
      clock: Date.now,
    }),
  ).toBeNull();
  expect(
    createStoriesInfrastructure({
      config: readStoriesConfig(enabled),
      clock: Date.now,
    })?.retainedProfiles,
  ).toEqual(["local-v1"]);
});

test("upload policy defaults and reduced duration are owned by backend configuration", () => {
  expect(readStoriesConfig(enabled)).toMatchObject({
    policy: { maxDurationMs: 15000, lifetimeMs: 86400000 },
  });
  expect(
    readStoriesConfig({
      ...enabled,
      ...Object.fromEntries([["STORIES_MAX_DURATION_MS", "10000"]]),
      ...Object.fromEntries([["STORIES_LIFETIME_MS", "3000000000"]]),
    }),
  ).toMatchObject({ policy: { maxDurationMs: 10000, lifetimeMs: 3000000000 } });
});
test("invalid duration and lifetime fail startup without exposing values", () => {
  for (const value of ["", "NaN", "12.5", "-1", "200", "15001"]) {
    expect(() =>
      readStoriesConfig({
        ...enabled,
        ...Object.fromEntries([["STORIES_MAX_DURATION_MS", value]]),
      }),
    ).toThrow("Invalid Stories configuration");
  }
  for (const value of [
    "",
    "NaN",
    "0",
    "-1",
    "1.5",
    "9007199254740992",
    "8640000000000000",
  ]) {
    expect(() =>
      readStoriesConfig({
        ...enabled,
        ...Object.fromEntries([["STORIES_LIFETIME_MS", value]]),
      }),
    ).toThrow("Invalid Stories configuration");
  }
});

test("minimum duration leaves one millisecond after capture safety margin", () => {
  expect(
    readStoriesConfig({
      ...enabled,
      ...Object.fromEntries([["STORIES_MAX_DURATION_MS", "201"]]),
    }),
  ).toMatchObject({
    policy: { maxDurationMs: 201, captureSafetyMarginMs: 200 },
  });
});
