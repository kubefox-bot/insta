import type { Recorder, RecorderState } from "@insta/media-recorder";
import type { Readable } from "svelte/store";
import type { PreviewActor } from "../preview/types";
import type {
  PublicationDependencies,
  PublicationView,
} from "../publication/types";
export type CameraView = Readonly<{
  state: RecorderState;
  stream: MediaStream | null;
}>;
export type RecorderView =
  | Readonly<
      | { kind: "closed" }
      | { kind: "ready"; camera: CameraView; cameraDisabled?: boolean }
      | { kind: "preview"; url: string; issue?: string }
      | { kind: "error"; code: string }
    >
  | Extract<PublicationView, { kind: "uploading" | "published" }>
  | (Extract<PublicationView, { kind: "checking" }> &
      Readonly<{ url?: string }>);
export type StoryRecorderDependencies = Omit<
  PublicationDependencies,
  "actor" | "onAuthentication"
> &
  Readonly<{
    recorderFactory: () => Recorder;
    session: Readable<Readonly<{ actor: PreviewActor | null; status: string }>>;
    continuation: () => Promise<void>;
  }>;
export type StoryRecorder = Readonly<{
  view: Readable<RecorderView>;
  open: () => Promise<void>;
  enableCamera: () => Promise<void>;
  start: () => void;
  stop: () => Promise<void>;
  retake: () => Promise<void>;
  confirmPublish: () => Promise<void>;
  hasPendingPublication: () => boolean;
  checkPublication: () => Promise<void>;
  close: () => Promise<void>;
  suspend: () => Promise<void>;
  setHidden: (hidden: boolean) => Promise<void>;
  dispose: () => Promise<void>;
}>;
