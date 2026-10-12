import type { Result } from "@bloodyowl/boxed";
import type {
  RecorderError,
  RecorderSession,
  RecorderState,
  RecorderTimers,
  RecorderVisibility,
  Recording,
  RecordingFinalizer,
} from "../types";
export type RecordingDependencies = Readonly<{
  session: RecorderSession;
  maxDurationMs: number;
  clock: () => number;
  timers: RecorderTimers;
  visibility: RecorderVisibility;
  update: (state: RecorderState) => void;
  release: () => void;
  finalizeRecording?: RecordingFinalizer;
}>;
export type ActiveRecording = Readonly<{
  start: () => Result<undefined, RecorderError>;
  stop: () => Promise<Result<Recording, RecorderError>>;
}>;
