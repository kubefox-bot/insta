import { Result } from "@bloodyowl/boxed";
import { StoryErrorCode } from "@insta/contracts/errors";
import {
  BufferSource,
  EncodedPacketSink,
  Input,
  type InputTrack,
  MP4,
} from "mediabunny";
import type { MediaError } from "../../ports/media-inspector/interfaces";
import { isWebm } from "./container";
import { inspectionPolicy } from "./conts";
import { inspectIso } from "./iso/inspect";
import type { IsoSample } from "./iso/types";
import type { PacketInspection } from "./types";
import { inspectWebmPacketFile } from "./webm/packet-file";

/**
 * Сопоставляет последовательность MP4-пакетов с ISO sample inventory по размеру и
 * количеству, требуя положительную длительность каждого пакета.
 */
const verifyTrack = async ({
  track,
  samples,
}: Readonly<{ track: InputTrack; samples: readonly IsoSample[] }>) => {
  let count = 0;
  for await (const packet of new EncodedPacketSink(track).packets()) {
    const sample = samples[count];
    if (
      !sample ||
      packet.data.byteLength !== sample.size ||
      packet.duration <= 0
    )
      throw new Error("Incomplete packets");
    count++;
  }
  if (count === 0 || count !== samples.length)
    throw new Error("Missing packets");
};
/**
 * Выбирает WebM по сигнатуре; для MP4 сохраняет поддержку H.264/AAC, проверяя
 * ISO-полноту, дорожки, размеры кадров и текущий duration limit. Mediabunny Input
 * освобождает в finally.
 */
export const inspectPacketFile = async ({
  bytes,
  maxDurationMs,
}: Readonly<{ bytes: Uint8Array; maxDurationMs: number }>): Promise<
  Result<PacketInspection, MediaError>
> => {
  if (isWebm(bytes)) return inspectWebmPacketFile({ bytes, maxDurationMs });
  const input = new Input({ formats: [MP4], source: new BufferSource(bytes) });
  try {
    const inspected = inspectIso(bytes);
    const tracks = await input.getTracks();
    const videos = await input.getVideoTracks();
    const audios = await input.getAudioTracks();
    if (
      tracks.length !== 2 ||
      videos.length !== 1 ||
      audios.length !== 1 ||
      videos[0]?.codec !== "avc" ||
      audios[0]?.codec !== "aac"
    )
      return Result.Error(StoryErrorCode.UnsupportedMedia);
    const width = await videos[0].getCodedWidth();
    const height = await videos[0].getCodedHeight();
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width <= 0 ||
      height <= 0 ||
      width * height > inspectionPolicy.maxDecodedPixels
    )
      return Result.Error(StoryErrorCode.UnsupportedMedia);
    for (const track of tracks)
      await verifyTrack({
        track,
        samples: inspected.samples.filter(
          (sample) => sample.trackId === track.id,
        ),
      });
    if (inspected.durationMs > maxDurationMs)
      return Result.Error(StoryErrorCode.TooLong);
    return Result.Ok({
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      durationMs: inspected.durationMs,
    });
  } catch {
    return Result.Error(StoryErrorCode.MalformedMedia);
  } finally {
    input.dispose();
  }
};
