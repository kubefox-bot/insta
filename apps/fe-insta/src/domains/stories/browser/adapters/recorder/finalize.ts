import { Result } from "@bloodyowl/boxed";
import { storyWireLimits } from "@insta/contracts/stories";
import type { RecordingFinalizer } from "@insta/media-recorder";
import { repairWebmDuration } from "@insta/media-recorder/webm";

/** Восстанавливает длительность WebM по elapsedMs и проверяет итоговый размер; ошибка ремонта или превышение лимита становятся finalization-failed. */
export const finalizeStoryRecording: RecordingFinalizer = async (recording) => {
  const repaired = await repairWebmDuration({
    blob: recording.blob,
    elapsedMs: recording.elapsedMs,
    maxBytes: storyWireLimits.maxFileBytes,
  });
  if (repaired.isError())
    return Result.Error({
      code: "finalization-failed",
      cause: repaired.getError(),
    });
  const blob = repaired.get();
  if (blob.size > storyWireLimits.maxFileBytes)
    return Result.Error({ code: "finalization-failed" });
  return Result.Ok({ ...recording, blob });
};
