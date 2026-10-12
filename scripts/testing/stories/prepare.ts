import { docker } from "../../infra/docker";
import { verifyRunningImage } from "../environment/inspect";
import type { AcceptanceConfig } from "../types";
import { storiesAcceptance } from "./conts";
import { verifySourceLabels } from "./images";
import { readPrivateStoriesProfile } from "./private-profile";
import { verifyStoryRuntime } from "./runtime";
import { readAcceptanceSource } from "./source";
import { validateStoriesProfile } from "./validate";

export const verifyStoriesEnvironment = async (config: AcceptanceConfig) => {
  const path = config["stories-profile"];
  if (!path) throw new Error("Full acceptance requires --stories-profile");
  const profile = validateStoriesProfile({
    profile: await readPrivateStoriesProfile(path),
    config,
  });
  await verifyStoryRuntime({ config, profile });
  const source = await readAcceptanceSource();
  const tree = await verifySourceLabels({ config, hash: source.hash });
  const storageId = JSON.parse(
    await docker(
      "image",
      "inspect",
      "--format",
      "{{json .Id}}",
      storiesAcceptance.storageImage,
    ),
  );
  await verifyRunningImage({
    service: "rustfs",
    expected: storageId,
    project: config.infrastructure.project,
  });
  return {
    storiesSourceTree: tree,
    storiesSourceManifest: source.hash,
    storage: storageId,
  };
};
