import type { z } from "zod";
import { storiesEnvironmentKeys } from "./conts";
import type { storiesProfileSchema } from "./schema";
export const verifyStoriesProfileParity = ({
  baseline,
  candidate,
}: Readonly<{
  baseline: z.infer<typeof storiesProfileSchema>;
  candidate: z.infer<typeof storiesProfileSchema>;
}>) => {
  for (const service of ["be-insta", "fe-insta", "testhost"])
    for (const key of [
      ...Object.values(storiesEnvironmentKeys),
      "DELIVERY_DRAGONFLY_URL",
    ])
      if (
        baseline.services[service]?.environment?.[key] !==
        candidate.services[service]?.environment?.[key]
      )
        throw new Error(
          "Telemetry restoration must preserve reviewed Stories configuration",
        );
};
