import { z } from "zod";
import { webmPolicy } from "./conts";

const integer = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().nonnegative().safe());
const frame = z.literal("frame");
const stream = z.literal("stream");
const video = z.literal("video");
const audio = z.literal("audio");
export const decodedRows = z
  .array(
    z.union([
      z.tuple([frame, video, integer, integer, integer, integer, integer]),
      z.tuple([frame, audio, integer, integer, integer, integer]),
      z.tuple([
        stream,
        integer,
        z.enum(["vp8", "vp9"]),
        video,
        z.literal("1/1000"),
      ]),
      z.tuple([
        stream,
        integer,
        z.literal("opus"),
        audio,
        z.literal("48000"),
        integer,
        z.literal("1/1000"),
      ]),
    ]),
  )
  .max(webmPolicy.maxPackets + webmPolicy.trackCount);
