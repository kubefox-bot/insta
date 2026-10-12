import type { Readable } from "svelte/store";
import type { StoryRecorder } from "../recorder/types";
export type DepartureView = "none" | "discard" | "uncertain";
export type CreationDepartureDependencies = Readonly<{
  recorder: Pick<StoryRecorder, "view" | "close" | "hasPendingPublication">;
  hasPreview: () => boolean;
  finish: () => Promise<void>;
}>;
export type CreationDeparture = Readonly<{
  view: Readable<DepartureView>;
  request: (destination?: () => Promise<void>) => Promise<void>;
  confirm: () => Promise<void>;
  cancel: () => void;
  hasUnpublished: () => boolean;
}>;
