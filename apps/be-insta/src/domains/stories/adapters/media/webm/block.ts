import { blockEncoding, ebmlId, webmPolicy } from "./conts";
import { splitLaces } from "./lacing";
import { opusSamples } from "./opus";
import { one, readUnsigned, readVint } from "./reader";
import type { Element, WebmPacket, WebmTrack } from "./types";
import { UnsupportedWebm } from "./unsupported";

/**
 * Разрешает track и signed timestamp block, проверяет reserved/invisible flags и
 * разрешённость lacing дорожкой.
 */
const readBlockHeader = ({
  bytes,
  block,
  tracks,
}: Readonly<{
  bytes: Uint8Array;
  block: Element;
  tracks: readonly WebmTrack[];
}>) => {
  const number = readVint({ bytes, at: block.data, end: block.end });
  const track = tracks.find((track) => BigInt(track.number) === number.value);
  const at = block.data + number.width;
  if (!track || number.unknown || at + blockEncoding.headerBytes >= block.end)
    throw Error("Invalid Block track/header");
  const flags = bytes[at + blockEncoding.flagsOffset] ?? 0;
  const reserved =
    block.id === ebmlId.simpleBlock
      ? blockEncoding.reservedSimple
      : blockEncoding.reservedGroup;
  if (flags & (reserved | blockEncoding.invisible))
    throw new UnsupportedWebm("Unsupported Block flags");
  const mode = (flags >> blockEncoding.laceShift) & blockEncoding.laceMask;
  if (mode && !track.lacing) throw Error("Track forbids lacing");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    track,
    mode,
    relativeTimestamp: view.getInt16(at),
    payload: at + blockEncoding.headerBytes,
  };
};
/**
 * Выбирает default либо явную video BlockDuration; ненулевой DiscardPadding и
 * неподдержанные audio/laced duration отклоняет.
 */
const readDuration = ({
  bytes,
  child,
  track,
  frameCount,
}: Readonly<{
  bytes: Uint8Array;
  child: Element;
  track: WebmTrack;
  frameCount: number;
}>) => {
  const trim = child.children.find((node) => node.id === ebmlId.discardPadding);
  if (trim && bytes.subarray(trim.data, trim.end).some((value) => value !== 0))
    throw new UnsupportedWebm("DiscardPadding trim");
  const explicit = child.children.find(
    (node) => node.id === ebmlId.blockDuration,
  );
  if (!explicit) return track.defaultDurationNs;
  if (frameCount > 1 || track.codec === "opus")
    throw new UnsupportedWebm("BlockDuration profile");
  const durationNs =
    readUnsigned(bytes, explicit) * webmPolicy.timestampScaleNs;
  if (!Number.isSafeInteger(durationNs) || durationNs <= 0)
    throw new UnsupportedWebm("BlockDuration value");
  return durationNs;
};
/**
 * Разворачивает SimpleBlock/BlockGroup в packet inventory, вычисляя время каждого lace по
 * Opus samples либо video duration. Отрицательное/небезопасное время отклоняет.
 */
export const readBlock = ({
  bytes,
  child,
  tracks,
  timestamp,
}: Readonly<{
  bytes: Uint8Array;
  child: Element;
  tracks: readonly WebmTrack[];
  timestamp: number;
}>): readonly WebmPacket[] => {
  const block =
    child.id === ebmlId.group ? one(child.children, ebmlId.block) : child;
  const { track, mode, relativeTimestamp, payload } = readBlockHeader({
    bytes,
    block,
    tracks,
  });
  const frames = splitLaces({ bytes, start: payload, end: block.end, mode });
  const durationNs = readDuration({
    bytes,
    child,
    track,
    frameCount: frames.length,
  });
  if (frames.length > 1 && track.codec !== "opus" && durationNs === null)
    throw new UnsupportedWebm("Video lace without duration");
  let timestampNs =
    (timestamp + relativeTimestamp) * webmPolicy.timestampScaleNs;
  return frames.map((frame) => {
    if (!Number.isSafeInteger(timestampNs) || timestampNs < 0)
      throw new UnsupportedWebm("Timeline origin");
    const samples = track.codec === "opus" ? opusSamples(frame) : 0;
    const packet = {
      track: track.number,
      timestampNs,
      size: frame.length,
      samples,
      durationNs,
      blockStart: block.start,
    };
    timestampNs +=
      track.codec === "opus"
        ? (samples * webmPolicy.nanosecondsPerSecond) / webmPolicy.sampleRate
        : (durationNs ?? 0);
    return packet;
  });
};
