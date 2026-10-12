import { storyPolicySchema } from "@insta/contracts/stories";
import { z } from "zod";
import { maximumDateMs } from "./conts";

const endpoint = z.url().refine((value) => {
  const url = new URL(value);
  return (
    ["http:", "https:"].includes(url.protocol) &&
    url.origin === value &&
    !url.username &&
    !url.password
  );
});
const profile = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  endpoint,
  playbackEndpoint: endpoint.refine(
    (value) => new URL(value).protocol === "https:",
  ),
  bucket: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
  region: z.string().min(1),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  prefix: z.string().regex(/^[a-zA-Z0-9_-]+\/$/),
});
export const storiesSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("disabled") }),
  z
    .strictObject({
      mode: z.literal("enabled"),
      policy: storyPolicySchema.refine(
        (value) =>
          Number.isSafeInteger(Date.now() + value.lifetimeMs) &&
          Date.now() + value.lifetimeMs <= maximumDateMs,
      ),
      activeProfile: z.string(),
      profiles: z.array(profile).min(1),
    })
    .refine(
      (value) =>
        value.profiles.some((profile) => profile.id === value.activeProfile) &&
        new Set(value.profiles.map((profile) => profile.id)).size ===
          value.profiles.length,
    ),
]);
