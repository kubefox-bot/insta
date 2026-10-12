import { z } from "zod";
import { probeFields } from "./conts";
import { launchDecoder } from "./launch-decoder";
import { readDecoder } from "./read-decoder";
import type { DecoderLauncher } from "./types";

const decoded = z.object({
  streams: z
    .array(
      z.object({
        [probeFields.codec]: z.enum(["h264", "aac"]),
        [probeFields.type]: z.enum(["video", "audio"]),
        [probeFields.frames]: z.coerce.number().int().positive(),
      }),
    )
    .length(2),
});
/**
 * Запускает проверку MP4 через ffprobe и принимает JSON с двумя допустимыми дорожками и
 * положительным числом кадров; неверный output возвращает false.
 */
export const verifyDecoding = async ({
  bytes,
  signal,
  launch = launchDecoder,
}: Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  signal: AbortSignal;
  launch?: DecoderLauncher;
}>) => {
  const output = await readDecoder({ child: launch(bytes), signal });
  if (output === null) return false;
  try {
    return decoded.safeParse(JSON.parse(output)).success;
  } catch {
    return false;
  }
};
