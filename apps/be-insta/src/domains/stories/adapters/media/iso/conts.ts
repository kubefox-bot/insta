export const isoLayout = {
  headerBytes: 8,
  extendedHeaderBytes: 16,
  wordBytes: 4,
  longBytes: 8,
  maxDepth: 12,
  maxBoxes: 4096,
  maxSamples: 8192,
  fullBoxFlagsMask: 0xffffff,
  versionShift: 24,
  fragmentHeaderTrackOffset: 4,
  fragmentHeaderFieldsOffset: 8,
  trackIdOffsets: { short: 12, long: 20 },
  timescaleOffsets: { short: 12, long: 20 },
  fragmentDefaultsBytes: 24,
} as const;
export const containerBoxes: readonly string[] = [
  "moov",
  "trak",
  "mdia",
  "minf",
  "stbl",
  "mvex",
  "moof",
  "traf",
  "mfra",
];
export const fragmentHeaderFlags = {
  base: 0x1,
  description: 0x2,
  duration: 0x8,
  size: 0x10,
  flags: 0x20,
  defaultBaseMoof: 0x20000,
} as const;
export const runFlags = {
  offset: 0x1,
  firstFlags: 0x4,
  duration: 0x100,
  size: 0x200,
  flags: 0x400,
  composition: 0x800,
} as const;
