import { docker } from "../infra/docker";
import { verifyCoreEnvironment } from "./environment/core";
import { verifyDeliveryEnvironment } from "./environment/delivery";
import { verifyRunningImage } from "./environment/inspect";
import { validateAcceptanceProject } from "./environment/project";
import { verifyStoriesEnvironment } from "./stories/prepare";
import type { AcceptanceConfig } from "./types";
export const verifyPreparedEnvironment = async (config: AcceptanceConfig) => {
  if (!config["testhost-image"] || !config["fe-image"] || !config["be-image"])
    throw new Error(
      "Prepared acceptance requires exact testhost/FE/BE sha256 image arguments; no implicit rebuild/up",
    );
  const { project } = config.infrastructure;
  validateAcceptanceProject({ project, scope: config.scope });
  await verifyRunningImage({
    service: "be-insta",
    expected: config["be-image"],
    project,
  });
  await verifyRunningImage({
    service: "fe-insta",
    expected: config["fe-image"],
    project,
  });
  const testhost = JSON.parse(
    await docker(
      "image",
      "inspect",
      "--format",
      "{{json .Id}}",
      `${project}-testhost`,
    ),
  );
  if (testhost !== config["testhost-image"])
    throw new Error(
      "Existing fixture testhost tag does not resolve to the exact prepared image",
    );
  await docker("image", "inspect", config["testhost-image"]);
  if (config.scope === "core")
    await verifyCoreEnvironment({
      project,
      testhostImage: config["testhost-image"],
    });
  await verifyDeliveryEnvironment(config);
  const stories =
    config.scope === "full" ? await verifyStoriesEnvironment(config) : {};
  return {
    ...stories,
    testhost: config["testhost-image"],
    frontend: config["fe-image"],
    backend: config["be-image"],
  };
};
