import type { z } from "zod";
import type { AcceptanceConfig } from "../types";
import { verifyStoriesProfileParity } from "./parity";
import type { storiesProfileSchema } from "./schema";
import { validateStoriesProfile } from "./validate";
export const verifyTelemetryStories = ({
  optional,
  disabled,
  config,
}: Readonly<{
  optional: z.infer<typeof storiesProfileSchema>;
  disabled: z.infer<typeof storiesProfileSchema>;
  config: AcceptanceConfig;
}>) => {
  if (config.scope === "full") {
    const baseline = validateStoriesProfile({ profile: optional, config });
    const candidate = validateStoriesProfile({ profile: disabled, config });
    verifyStoriesProfileParity({ baseline, candidate });
    return;
  }
  for (const profile of [optional, disabled])
    for (const service of ["be-insta", "fe-insta", "testhost"])
      if (profile.services[service]?.environment?.STORIES_MODE === "enabled")
        throw new Error(
          "Core telemetry profiles must preserve disabled Stories",
        );
};
