import { z } from "zod";
import { docker } from "../../infra/docker";
import type { AcceptanceConfig } from "../types";
import { storiesAcceptance } from "./conts";
export const verifySourceLabels = async ({
  config,
  hash,
}: Readonly<{ config: AcceptanceConfig; hash: string }>) => {
  const trees = new Set<string>();
  for (const image of [
    config["fe-image"],
    config["be-image"],
    config["testhost-image"],
  ]) {
    if (!image) throw new Error("Missing Stories prepared image");
    const labels = z
      .record(z.string(), z.string())
      .parse(
        JSON.parse(
          await docker(
            "image",
            "inspect",
            "--format",
            "{{json .Config.Labels}}",
            image,
          ),
        ),
      );
    const tree = labels[storiesAcceptance.sourceLabel];
    if (
      !tree ||
      !/^[a-f0-9]{40}$/.test(tree) ||
      labels[storiesAcceptance.manifestLabel] !== hash
    )
      throw new Error(
        "Prepared Stories source labels do not match current executable/config/test manifest",
      );
    trees.add(tree);
  }
  if (trees.size !== 1)
    throw new Error("Prepared Stories images have different source trees");
  const tree = [...trees][0];
  if (!tree) throw new Error("Missing Stories source identity");
  return tree;
};
