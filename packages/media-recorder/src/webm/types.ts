export type WebmRepairInput = Readonly<{
  blob: Blob;
  elapsedMs: number;
  /** Consumer-owned input allocation cap; appended metadata can grow the returned Blob. */
  maxBytes: number;
}>;
export type WebmRepairError = Readonly<{
  code:
    | "invalid-input"
    | "invalid-layout"
    | "unsupported-layout"
    | "repair-failed";
}>;
