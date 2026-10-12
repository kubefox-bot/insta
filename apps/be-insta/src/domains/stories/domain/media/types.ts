export type PresentationEvidence = Readonly<{
  metadataMs: number;
  audio: readonly Readonly<{ timestampNs: number; samples: number }>[];
  video: readonly Readonly<{
    timestampNs: number;
    durationNs: number | null;
  }>[];
}>;
