import type { StoryRuntimePolicy } from "@insta/contracts/stories";
import { createRecorder } from "@insta/media-recorder";
import { storyCaptureOptions } from "./conts";
import { finalizeStoryRecording } from "./finalize";
import type { NativeRecorderDependencies } from "./types";
/** Создаёт нативную запись Stories в WebM с длительностью из публичной политики за вычетом safety margin и финализацией метаданных; общая библиотека сохраняет собственную поддержку MP4. */
export const createNativeStoryRecorder = (
  policy: StoryRuntimePolicy,
  dependencies: NativeRecorderDependencies = {},
) =>
  createRecorder({
    ...dependencies,
    ...storyCaptureOptions,
    maxDurationMs: policy.maxDurationMs - policy.captureSafetyMarginMs,
    finalizeRecording: finalizeStoryRecording,
  });
