import { storyWireLimits } from "@insta/contracts/stories";
import { z } from "zod";
import { webmPolicy } from "./conts";

const integer = z.number().int().nonnegative().safe();
export const webmReply = z.object({
  container: z.literal("webm"),
  videoCodec: z.enum(["vp8", "vp9"]),
  audioCodec: z.literal("opus"),
  durationMs: z.number().positive().finite().max(storyWireLimits.maxDurationMs),
  webm: z.object({
    metadataMs: z.number().positive().finite(),
    tracks: z
      .array(
        z.object({
          number: integer,
          codec: z.enum(["vp8", "vp9", "opus"]),
          width: integer,
          height: integer,
          channels: integer,
          defaultDurationNs: integer.nullable(),
          lacing: z.boolean(),
        }),
      )
      .length(webmPolicy.trackCount),
    packets: z
      .array(
        z.object({
          track: integer,
          timestampNs: integer,
          size: integer.positive(),
          samples: integer,
          durationNs: integer.nullable(),
          blockStart: integer,
        }),
      )
      .min(webmPolicy.trackCount)
      .max(webmPolicy.maxPackets),
  }),
});
