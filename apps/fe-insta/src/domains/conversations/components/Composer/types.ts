import type { Readable } from "svelte/store";
import type { QueueError } from "../../browser/outbox/domain/types";
import type { Props } from "./props";

export type SubmissionView = Readonly<{
  pending: boolean;
  issue: QueueError | null;
}>;
export type SubmissionDependencies = Readonly<
  Pick<Props, "send" | "change"> & {
    text: () => string;
    disabled: () => boolean;
  }
>;
export type Submission = Readonly<{
  view: Readable<SubmissionView>;
  submit: () => Promise<void>;
  dispose: () => void;
}>;

export type GrowthMetrics = Readonly<{ width: number; typography: string }>;
export type GrowthMeasurement = Readonly<{
  check: () => void;
  refresh: () => void;
  dispose: () => void;
}>;
