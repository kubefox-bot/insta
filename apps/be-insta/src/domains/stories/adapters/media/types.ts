import type { Result } from "@bloodyowl/boxed";
import type {
  MediaError,
  MediaInspector,
  VerifiedMedia,
} from "../../ports/media-inspector/interfaces";
export type InspectionOperation = (
  input: Readonly<{
    input: Parameters<MediaInspector["inspect"]>[0];
    signal: AbortSignal;
  }>,
) => Promise<Result<VerifiedMedia, MediaError>>;
export type DecoderProcess = Readonly<{
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  exited: Promise<number>;
  exitCode: number | null;
  kill: (signal: "SIGKILL") => void;
}>;
export type DecoderLauncher = (
  bytes: Uint8Array<ArrayBuffer>,
  options?: Readonly<{ container: "webm" }>,
) => DecoderProcess;

import type { WebmInventory } from "./webm/types";
export type PacketInspection =
  | Extract<VerifiedMedia, { container: "mp4" }>
  | (Extract<VerifiedMedia, { container: "webm" }> &
      Readonly<{ webm: WebmInventory }>);
