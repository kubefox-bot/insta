import { expect, test } from "bun:test";
import { createStoriesTelemetryProfiles } from "../../scripts/infra/stories/telemetry";
import {
  readAcceptanceConfig,
  readAcceptanceEnvironment,
} from "../../scripts/testing/config";
import { composeFields } from "../../scripts/testing/conts";
import { storiesEnvironmentKeys } from "../../scripts/testing/stories/conts";
import { validateStoriesProfile } from "../../scripts/testing/stories/validate";
import { validateTelemetryProfiles } from "../../scripts/testing/telemetry/validate";

const image = `sha256:${"a".repeat(64)}`;
const storageImage =
  "rustfs/rustfs:1.0.1@sha256:1803faef57627e2d9c2e7d89d655d712ddded5389040054987163043fecb6a3c";
const config = () =>
  readAcceptanceConfig([
    "--scope=full",
    "--stories-profile=.infra/stories-compose.json",
    ...["fe", "be", "testhost"].map((key) => `--${key}-image=${image}`),
  ]);
const profile = () => ({
  services: {
    "be-insta": {
      image,
      environment: {
        [storiesEnvironmentKeys.mode]: "enabled",
        [storiesEnvironmentKeys.activeProfile]: "local",
        [storiesEnvironmentKeys.profiles]: JSON.stringify([
          {
            id: "local",
            endpoint: "http://rustfs:9000",
            playbackEndpoint: "https://localhost",
            bucket: "stories",
            region: "us-east-1",
            accessKeyId: "synthetic",
            secretAccessKey: "synthetic",
            prefix: "stories/",
          },
        ]),
      },
    },
    "fe-insta": {
      image,
      environment: { [storiesEnvironmentKeys.mode]: "enabled" },
    },
    testhost: {
      image,
      user: "bun",
      [composeFields.workingDirectory]: "/workspace",
      volumes: [],
      environment: {
        [storiesEnvironmentKeys.mode]: "enabled",
        [storiesEnvironmentKeys.activeProfile]: "local",
        [storiesEnvironmentKeys.profiles]: "",
      },
    },
    rustfs: {
      image: storageImage,
      volumes: ["stories-storage:/data"],
      environment: {},
    },
  },
});
const prepared = () => {
  const value = profile();
  value.services.testhost.environment.STORIES_STORAGE_PROFILES =
    value.services["be-insta"].environment.STORIES_STORAGE_PROFILES;
  return value;
};
test("full profile is explicit and reaches fixture composition; standalone core has no Stories requirement", () => {
  expect(readAcceptanceConfig([]).scope).toBe("core");
  expect(readAcceptanceEnvironment(config()).COMPOSE_FILE).toContain(
    ".infra/stories-compose.json",
  );
  expect(() =>
    validateStoriesProfile({ profile: prepared(), config: config() }),
  ).not.toThrow();
});
test("full setup rejects missing provider, disabled capability, wrong immutable image and testhost mounts", () => {
  for (const service of [
    "be-insta",
    "fe-insta",
    "testhost",
    "rustfs",
  ] as const) {
    const value = prepared();
    const { [service]: _removed, ...services } = value.services;
    expect(() =>
      validateStoriesProfile({ profile: { services }, config: config() }),
    ).toThrow();
    const wrong = prepared();
    wrong.services[service].image = `sha256:${"b".repeat(64)}`;
    expect(() =>
      validateStoriesProfile({ profile: wrong, config: config() }),
    ).toThrow();
  }
  const disabled = prepared();
  disabled.services["be-insta"].environment.STORIES_MODE = "disabled";
  expect(() =>
    validateStoriesProfile({ profile: disabled, config: config() }),
  ).toThrow();
  const mount = prepared();
  expect(() =>
    validateStoriesProfile({
      profile: {
        services: {
          ...mount.services,
          testhost: { ...mount.services.testhost, volumes: [".:/workspace"] },
        },
      },
      config: config(),
    }),
  ).toThrow();
});
test("optional and restored full profiles retain the exact enabled storage capability", () => {
  const base = prepared();
  const { defaults, optional: active } = createStoriesTelemetryProfiles(
    base.services,
  );
  expect(() =>
    validateTelemetryProfiles({ active, defaults, config: config() }),
  ).not.toThrow();
  defaults.services["fe-insta"].environment.STORIES_MODE = "disabled";
  expect(() =>
    validateTelemetryProfiles({ active, defaults, config: config() }),
  ).toThrow();
});

test("private storage settings are rejected if optional/default profile is group-readable", async () => {
  const { mkdtemp, chmod, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { readPrivateStoriesProfile } = await import(
    "../../scripts/testing/stories/private-profile"
  );
  const directory = await mkdtemp(join(tmpdir(), "stories-profile-"));
  const path = join(directory, "profile.json");
  try {
    await Bun.write(path, JSON.stringify(prepared()));
    await chmod(path, 0o600);
    expect(await readPrivateStoriesProfile(path)).toEqual(prepared());
    await chmod(path, 0o640);
    await expect(readPrivateStoriesProfile(path)).rejects.toThrow("private");
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("core rejects a Stories profile even when core is the default scope", () => {
  for (const args of [
    ["--stories-profile=.infra/stories-compose.json"],
    ["--scope=core", "--stories-profile=.infra/stories-compose.json"],
  ])
    expect(() => readAcceptanceConfig(args)).toThrow(
      "Stories profile requires full scope",
    );
  expect(readAcceptanceConfig(["--scope=core"]).scope).toBe("core");
});
