import { decoderOptions, inspectionPolicy, probeArguments } from "./conts";
import type { DecoderLauncher } from "./types";
import { webmProbeArguments } from "./webm/conts";
/**
 * Запускает ffprobe с ограничениями allocation/pixels и профилем MP4 или WebM. Linux
 * дополнительно использует prlimit CPU/address space; macOS этих OS-лимитов не получает.
 * Процесс завершает владелец readDecoder.
 */
export const launchDecoder: DecoderLauncher = (bytes, options) => {
  if (process.platform !== "linux" && process.platform !== "darwin")
    throw new Error("Unsupported decoder platform");
  const programs = {
    linux: [
      "prlimit",
      `--as=${inspectionPolicy.maxDecoderAddressSpaceBytes}`,
      `--cpu=${inspectionPolicy.maxDecoderCpuSeconds}`,
      "--",
      "ffprobe",
    ],
    darwin: ["ffprobe"],
  };
  return Bun.spawn(
    [
      ...programs[process.platform],
      decoderOptions.threads,
      String(inspectionPolicy.decoderThreads),
      decoderOptions.allocation,
      String(inspectionPolicy.maxDecoderAllocationBytes),
      decoderOptions.pixels,
      String(inspectionPolicy.maxDecodedPixels),
      ...(options?.container === "webm" ? webmProbeArguments : probeArguments),
    ],
    {
      stdin: bytes,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
};
