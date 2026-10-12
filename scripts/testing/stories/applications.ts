import type { z } from "zod";
import type { AcceptanceConfig } from "../types";
import type { storiesProfileSchema } from "./schema";
export const verifyProfileApplications = ({
  profile: parsed,
  config,
}: Readonly<{
  profile: z.infer<typeof storiesProfileSchema>;
  config: AcceptanceConfig;
}>) => {
  for (const [service, key] of [
    ["be-insta", "be-image"],
    ["fe-insta", "fe-image"],
    ["testhost", "testhost-image"],
  ] as const) {
    const target = parsed.services[service];
    if (
      !config[key] ||
      target?.image !== config[key] ||
      target.environment?.STORIES_MODE !== "enabled"
    )
      throw new Error(
        `Stories profile ${service} must preserve exact image and enabled capability`,
      );
    if (target.volumes?.length)
      throw new Error(`Stories ${service} cannot mount source or dependencies`);
  }
};
