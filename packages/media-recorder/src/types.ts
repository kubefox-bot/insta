import type { Result } from "@bloodyowl/boxed";

export type RecorderError = Readonly<{
  code:
    | "unsupported"
    | "invalid-options"
    | "invalid-state"
    | "disposed"
    | "permission-denied"
    | "device-unavailable"
    | "device-failed"
    | "recorder-failed"
    | "finalization-failed";
  cause?: unknown;
}>;
export type Recording = Readonly<{
  blob: Blob;
  mimeType: string;
  elapsedMs: number;
}>;
export type RecordingFinalizer = (
  recording: Recording,
) => Promise<Result<Recording, RecorderError>>;
export type RecorderState =
  | Readonly<{
      status:
        | "idle"
        | "requesting-permission"
        | "ready"
        | "stopping"
        | "recorded"
        | "disposed";
    }>
  | Readonly<{ status: "recording"; elapsedMs: number }>
  | Readonly<{ status: "error"; error: RecorderError }>;
export type RecorderEvents = Readonly<{
  data: (chunk: Blob) => void;
  stop: () => void;
  error: (cause: unknown) => void;
}>;
export type RecorderSession = Readonly<{
  mimeType: string;
  start: () => void;
  stop: () => void;
  subscribe: (events: RecorderEvents) => () => void;
}>;
export type RecorderFactory = Readonly<{
  isTypeSupported: (mimeType: string) => boolean;
  create: (stream: MediaStream, mimeType: string) => RecorderSession;
}>;
export type RecorderTimers = Readonly<{
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (timer: unknown) => void;
}>;
export type RecorderVisibility = Readonly<{
  isHidden: () => boolean;
  subscribe: (onHidden: () => void) => () => void;
}>;
export type RecorderOptions = Readonly<{
  maxDurationMs: number;
  mimeCandidates?: readonly string[];
  constraints?: MediaStreamConstraints;
  clock?: () => number;
  timers?: RecorderTimers;
  mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  recorderFactory?: RecorderFactory;
  visibility?: RecorderVisibility;
  /** Runs once after native stop and final data; stop/dispose await its outcome. */
  finalizeRecording?: RecordingFinalizer;
}>;
export type SupportedRecorder = Readonly<{
  mimeType: string;
  factory: RecorderFactory;
  devices: Pick<MediaDevices, "getUserMedia">;
  constraints: MediaStreamConstraints;
}>;
export type Recorder = Readonly<{
  checkSupport: () => Result<Readonly<{ mimeType: string }>, RecorderError>;
  /** The stream is borrowed. Only the recorder stops its tracks; the UI attaches it to muted, playsinline video. */
  openPreview: () => Promise<Result<MediaStream, RecorderError>>;
  start: () => Result<undefined, RecorderError>;
  stop: () => Promise<Result<Recording, RecorderError>>;
  /** Callback failures are reported asynchronously through global reportError (or an uncaught microtask error when absent), without changing recorder outcomes or interrupting sibling notifications/effects. */
  subscribe: (subscriber: (state: RecorderState) => void) => () => void;
  /** Cancels future work and waits for permission/recorder settlement before releasing owned resources. */
  dispose: () => Promise<void>;
}>;
