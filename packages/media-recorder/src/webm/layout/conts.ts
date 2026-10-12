export const maxLayoutElements = 100_000;
export const maxInfoBytes = 65_536;
export const maxIdBytes = 4;
export const maxSizeBytes = 8;
export const byteRadix = 256;
export const bitsPerByte = 8;
export const byteMask = 0xff;
export const leadingByteZeroOffset = 23;
export const vintBitsPerByte = 7;
export const ids = {
  ebml: 0x1a45dfa3,
  segment: 0x18538067,
  info: 0x1549a966,
  tracks: 0x1654ae6b,
  cluster: 0x1f43b675,
  seekHead: 0x114d9b74,
  cues: 0x1c53bb6b,
  void: 0xec,
  crc: 0xbf,
  scale: 0x2ad7b1,
  duration: 0x4489,
  timestamp: 0xe7,
  simpleBlock: 0xa3,
  blockGroup: 0xa0,
  position: 0xa7,
  previousSize: 0xab,
  silentTracks: 0x5854,
  muxingApp: 0x4d80,
  writingApp: 0x5741,
  date: 0x4461,
  title: 0x7ba9,
  segmentUid: 0x73a4,
  segmentFilename: 0x7384,
  previousUid: 0x3cb923,
  previousFilename: 0x3c83ab,
  nextUid: 0x3eb923,
  nextFilename: 0x3e83bb,
} as const;
export const segmentIds: readonly number[] = [
  ids.info,
  ids.tracks,
  ids.cluster,
  ids.seekHead,
  ids.cues,
];
export const clusterChildIds: readonly number[] = [
  ids.timestamp,
  ids.simpleBlock,
  ids.blockGroup,
  ids.position,
  ids.previousSize,
  ids.silentTracks,
  ids.void,
  ids.crc,
];
// Only scalar Info children are passed to the public provider parser.
export const infoChildIds: readonly number[] = [
  ids.scale,
  ids.duration,
  ids.void,
  ids.muxingApp,
  ids.writingApp,
  ids.date,
  ids.title,
  ids.segmentUid,
  ids.segmentFilename,
  ids.previousUid,
  ids.previousFilename,
  ids.nextUid,
  ids.nextFilename,
];
