import { Result } from "@bloodyowl/boxed";
import { StoryErrorCode } from "@insta/contracts/errors";
import { presentationHorizon } from "../../../domain/media/horizon";
import type { MediaError } from "../../../ports/media-inspector/interfaces";
import type { PacketInspection } from "../types";
import { inspectWebm } from "./inspect";
import { UnsupportedWebm } from "./unsupported";
/**
 * Строит WebM inventory и доказывает presentation horizon по metadata, видео и Opus
 * samples в рамках текущей upload-policy. Различает неподдержанный профиль и повреждённый
 * контейнер.
 */
export const inspectWebmPacketFile = ({
  bytes,
  maxDurationMs,
}: Readonly<{ bytes: Uint8Array; maxDurationMs: number }>): Result<
  PacketInspection,
  MediaError
> => {
  try {
    const inventory = inspectWebm(bytes);
    const video = inventory.tracks.find((track) => track.codec !== "opus");
    const audio = inventory.tracks.find((track) => track.codec === "opus");
    if (!video || video.codec === "opus" || !audio)
      return Result.Error(StoryErrorCode.UnsupportedMedia);
    const horizon = presentationHorizon({
      maxDurationMs,
      metadataMs: inventory.metadataMs,
      audio: inventory.packets.filter(
        (packet) => packet.track === audio.number,
      ),
      video: inventory.packets.filter(
        (packet) => packet.track === video.number,
      ),
    });
    if (horizon.isError()) return Result.Error(horizon.getError());
    return Result.Ok({
      container: "webm",
      videoCodec: video.codec,
      audioCodec: "opus",
      durationMs: horizon.get(),
      webm: inventory,
    });
  } catch (error) {
    return Result.Error(
      error instanceof UnsupportedWebm
        ? StoryErrorCode.UnsupportedMedia
        : StoryErrorCode.MalformedMedia,
    );
  }
};
