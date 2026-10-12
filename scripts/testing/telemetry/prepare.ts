import { chmod, unlink } from "node:fs/promises";
import { artifactPermissions } from "../conts";
import { verifyStoriesProfileParity } from "../stories/parity";
import { readPrivateStoriesProfile } from "../stories/private-profile";
import { validateStoriesProfile } from "../stories/validate";
import type { AcceptanceConfig } from "../types";
import { validateTelemetryProfiles } from "./validate";
export const prepareTelemetryOwnership = async ({
  config,
  directory,
  testRunId,
  activePath,
  defaultPath,
}: {
  readonly config: AcceptanceConfig;
  readonly directory: string;
  readonly testRunId: string;
  readonly activePath: string;
  readonly defaultPath: string;
}) => {
  const profiles = validateTelemetryProfiles({
    active: await (config.scope === "full"
      ? readPrivateStoriesProfile(activePath)
      : Bun.file(activePath).json()),
    defaults: await (config.scope === "full"
      ? readPrivateStoriesProfile(defaultPath)
      : Bun.file(defaultPath).json()),
    config,
  });
  if (config.scope === "full" && config["stories-profile"]) {
    const baseline = validateStoriesProfile({
      profile: await readPrivateStoriesProfile(config["stories-profile"]),
      config,
    });
    verifyStoriesProfileParity({ baseline, candidate: profiles.optional });
    verifyStoriesProfileParity({ baseline, candidate: profiles.disabled });
  }
  const ownedPath = `${directory}/receiver-ownership.json`;
  const runId = `insta-done02-${testRunId}`;
  await Bun.write(
    ownedPath,
    JSON.stringify({
      services: {
        "telemetry-receiver": { labels: { "insta.testRunId": runId } },
      },
    }),
  );
  try {
    await chmod(ownedPath, artifactPermissions.file);
  } catch (error) {
    await unlink(ownedPath);
    throw error;
  }
  const prefix = [
    "docker",
    "--host",
    config.infrastructure.endpoint,
    "compose",
    "--project-name",
    config.infrastructure.project,
    "-f",
    "compose.yaml",
    ...(config["stories-profile"] ? ["-f", config["stories-profile"]] : []),
  ];
  return { ownedPath, runId, prefix };
};
