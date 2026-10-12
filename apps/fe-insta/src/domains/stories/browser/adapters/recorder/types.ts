import type { RecorderOptions } from "@insta/media-recorder";
export type NativeRecorderDependencies = Pick<
  RecorderOptions,
  "clock" | "timers" | "mediaDevices" | "recorderFactory" | "visibility"
>;
