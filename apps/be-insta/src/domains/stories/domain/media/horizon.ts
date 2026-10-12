import { Result } from "@bloodyowl/boxed";
import { StoryErrorCode } from "@insta/contracts/errors";
import type { MediaError } from "../../ports/media-inspector/interfaces";
import { contentEnd, terminalHoldValid } from "./content-end";
import { horizonPolicy } from "./conts";
import type { PresentationEvidence } from "./types";
/**
 * Сопоставляет metadata с концом реального аудио/видео и проверяет terminal hold.
 * Превышение текущего upload-лимита отличает от недоказуемой длительности; результат
 * округляет вверх до наносекунд.
 */
export const presentationHorizon = (
  evidence: PresentationEvidence & Readonly<{ maxDurationMs: number }>,
): Result<number, MediaError> => {
  const { metadataMs, audio, video } = evidence;
  const unitsPerMs =
    BigInt(horizonPolicy.nanosecondsPerMs) *
    BigInt(horizonPolicy.audioSampleRate);
  const maximum = BigInt(evidence.maxDurationMs) * unitsPerMs;
  const content = contentEnd(evidence);
  if (content > maximum || metadataMs > evidence.maxDurationMs)
    return Result.Error(StoryErrorCode.TooLong);
  if (
    !audio.length ||
    !video.length ||
    !Number.isFinite(metadataMs) ||
    metadataMs <= 0
  )
    return Result.Error(StoryErrorCode.DurationUnprovable);
  const metadata =
    BigInt(Math.ceil(metadataMs * horizonPolicy.nanosecondsPerMs)) *
    BigInt(horizonPolicy.audioSampleRate);
  const difference =
    metadata > content ? metadata - content : content - metadata;
  if (difference > BigInt(horizonPolicy.metadataToleranceMs) * unitsPerMs)
    return Result.Error(StoryErrorCode.DurationUnprovable);
  const horizon = metadata > content ? metadata : content;
  if (horizon > maximum) return Result.Error(StoryErrorCode.TooLong);
  if (!terminalHoldValid({ video, horizon }))
    return Result.Error(StoryErrorCode.DurationUnprovable);
  const sampleRate = BigInt(horizonPolicy.audioSampleRate);
  const horizonNs = (horizon + sampleRate - 1n) / sampleRate;
  return Result.Ok(Number(horizonNs) / horizonPolicy.nanosecondsPerMs);
};
