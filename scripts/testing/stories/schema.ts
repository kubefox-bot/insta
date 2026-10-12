import { z } from "zod";
import { composeFields } from "../conts";
export const storiesProfileSchema = z.object({
  services: z.record(
    z.string(),
    z
      .object({
        image: z.string().optional(),
        user: z.string().optional(),
        [composeFields.workingDirectory]: z.string().optional(),
        volumes: z.array(z.string()).optional(),
        environment: z.record(z.string(), z.string()).optional(),
      })
      .passthrough(),
  ),
});
