export const inspectionPolicy = {
  maxWorkers: 2,
  deadlineMs: 10000,
  millisecondsPerSecond: 1000,
  maxProbeOutputBytes: 65536,
  maxDecoderAllocationBytes: 67108864,
  decoderThreads: 1,
  maxDecodedPixels: 921600,
  maxDecoderAddressSpaceBytes: 536870912,
  maxDecoderCpuSeconds: 8,
} as const;
export const probeArguments = [
  "-v",
  "error",
  "-err_detect",
  "explode",
  "-count_frames",
  "-show_entries",
  "stream=codec_name,codec_type,nb_read_frames",
  "-of",
  "json",
  "-i",
  "pipe:0",
] as const;
export const probeFields = {
  codec: "codec_name",
  type: "codec_type",
  frames: "nb_read_frames",
} as const;

export const decoderOptions = {
  threads: "-threads",
  allocation: "-max_alloc",
  pixels: "-max_pixels",
} as const;

export const mediaSignatures = { webm: 0x1a45dfa3 } as const;
