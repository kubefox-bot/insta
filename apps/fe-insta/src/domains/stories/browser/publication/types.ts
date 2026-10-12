import type { Readable } from "svelte/store";
import type { createStoryPreview } from "../preview/create";
import type { PreviewActor } from "../preview/types";
export type PublicationOutcome = Readonly<
  | { kind: "unknown" }
  | { kind: "authentication" }
  | { kind: "rejected"; code: string }
  | { kind: "published" }
>;
export type PublicationStatus = Readonly<
  | { kind: "unknown" }
  | { kind: "authentication" }
  | {
      kind: "known";
      operationId: string;
      state: "not_found" | "pending" | "failed" | "published";
    }
>;
export type PublicationView = Readonly<
  | { kind: "idle" }
  | { kind: "uploading"; operationId: string }
  | {
      kind: "checking";
      operationId: string;
      status: "unknown" | "pending" | "not_found";
    }
  | { kind: "rejected"; code: string }
  | { kind: "published"; operationId: string }
>;
export type PublicationDependencies = Readonly<{
  preview: ReturnType<typeof createStoryPreview>;
  actor: () => PreviewActor | null;
  uuid: () => string;
  publish: (
    input: Readonly<{
      blob: Blob;
      operationId: string;
      generation: string;
      signal: AbortSignal;
    }>,
  ) => Promise<PublicationOutcome>;
  readPublication: (
    input: Readonly<{ operationId: string; signal: AbortSignal }>,
  ) => Promise<PublicationStatus>;
  onPublished: () => Promise<void>;
  onAuthentication: () => Promise<void>;
}>;
export type Publication = Readonly<{
  view: Readable<PublicationView>;
  confirm: () => Promise<void>;
  check: () => Promise<void>;
  canRetake: () => boolean;
  cancel: () => void;
  reset: () => void;
  dispose: () => void;
}>;
