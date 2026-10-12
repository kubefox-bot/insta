import { inspectionPolicy } from "../conts";
import { readAudioProfile } from "./audio-profile";
import { ebmlId, trackTypes, webmPolicy } from "./conts";
import { one, readUnsigned, readUnsignedBigInt } from "./reader";
import type { Element, WebmTrack } from "./types";
import { UnsupportedWebm } from "./unsupported";

/**
 * Проверяет допустимые lacing/default duration и отклоняет ненулевой CodecDelay,
 * поскольку профиль не поддерживает trim timeline.
 */
const readTrackTiming = ({
  bytes,
  track,
}: Readonly<{ bytes: Uint8Array; track: Element }>) => {
  const delay = track.children.find((node) => node.id === ebmlId.codecDelay);
  if (delay && readUnsigned(bytes, delay) !== 0)
    throw new UnsupportedWebm("CodecDelay trim");
  const lace = track.children.find((node) => node.id === ebmlId.flagLacing);
  const lacing = lace ? readUnsigned(bytes, lace) : 1;
  if (lacing > 1) throw Error("Invalid lacing flag");
  const defaults = track.children.find(
    (node) => node.id === ebmlId.defaultDuration,
  );
  const defaultDurationNs = defaults ? readUnsigned(bytes, defaults) : null;
  if (defaultDurationNs !== null && defaultDurationNs <= 0)
    throw Error("Invalid default duration");
  return { defaultDurationNs, lacing: lacing === 1 };
};
/**
 * Разрешает video без codec private/audio-конфигурации и проверяет положительные размеры
 * в пределах decoded pixel budget.
 */
const readVideoProfile = ({
  bytes,
  track,
}: Readonly<{ bytes: Uint8Array; track: Element }>) => {
  if (
    track.children.some(
      (node) => node.id === ebmlId.private || node.id === ebmlId.audio,
    )
  )
    throw new UnsupportedWebm("Video configuration");
  const video = one(track.children, ebmlId.video);
  const width = readUnsigned(bytes, one(video.children, ebmlId.width));
  const height = readUnsigned(bytes, one(video.children, ebmlId.height));
  if (
    width <= 0 ||
    height <= 0 ||
    width * height > inspectionPolicy.maxDecodedPixels
  )
    throw new UnsupportedWebm("Video dimensions");
  return { width, height, channels: 0 };
};
/**
 * Отображает допустимые WebM CodecID VP8/VP9 в внутренние имена; неизвестный кодек
 * возвращает null для отказа профиля.
 */
const videoCodec = (codec: string) => {
  switch (codec) {
    case "V_VP8":
      return "vp8";
    case "V_VP9":
      return "vp9";
    default:
      return null;
  }
};
/**
 * Разбирает номер, timing и профиль дорожки, допуская VP8/VP9 video либо Opus audio;
 * несовместимые настройки отклоняет.
 */
const readTrack = ({
  bytes,
  track,
}: Readonly<{ bytes: Uint8Array; track: Element }>): WebmTrack => {
  const number = readUnsigned(bytes, one(track.children, ebmlId.trackNumber));
  if (number < 1 || number > webmPolicy.maxTrackNumber)
    throw new UnsupportedWebm("Track number");
  const timing = readTrackTiming({ bytes, track });
  const type = readUnsigned(bytes, one(track.children, ebmlId.trackType));
  const codecNode = one(track.children, ebmlId.codec);
  const codec = new TextDecoder().decode(
    bytes.subarray(codecNode.data, codecNode.end),
  );
  const video = videoCodec(codec);
  if (type === trackTypes.video && video)
    return {
      number,
      codec: video,
      ...timing,
      ...readVideoProfile({ bytes, track }),
    };
  if (type !== trackTypes.audio || codec !== "A_OPUS")
    throw new UnsupportedWebm("WebM codec");
  if (
    track.children.some((node) => node.id === ebmlId.video) ||
    timing.defaultDurationNs !== null
  )
    throw new UnsupportedWebm("Audio profile");
  return {
    number,
    codec: "opus",
    ...timing,
    ...readAudioProfile({ bytes, track }),
  };
};
/**
 * Требует две дорожки с уникальными номерами/UID и ровно одной Opus-дорожкой; вторую
 * проверяет как поддерживаемое видео.
 */
export const readTracks = ({
  bytes,
  nodes,
}: Readonly<{
  bytes: Uint8Array;
  nodes: readonly Element[];
}>): readonly WebmTrack[] => {
  const tracks = one(nodes, ebmlId.tracks).children.filter(
    (node) => node.id === ebmlId.track,
  );
  if (tracks.length !== webmPolicy.trackCount)
    throw new UnsupportedWebm("WebM requires two tracks");
  verifyTrackUids({ bytes, tracks });
  const result = tracks.map((track) => readTrack({ bytes, track }));
  if (
    new Set(result.map((track) => track.number)).size !==
      webmPolicy.trackCount ||
    result.filter((track) => track.codec === "opus").length !== 1
  )
    throw new UnsupportedWebm("Track inventory");
  return result;
};

/**
 * Требует ненулевые уникальные TrackUID, сохраняя точность bigint для полного диапазона
 * EBML uint.
 */
const verifyTrackUids = ({
  bytes,
  tracks,
}: Readonly<{ bytes: Uint8Array; tracks: readonly Element[] }>) => {
  const identifiers = tracks.map((track) =>
    readUnsignedBigInt(bytes, one(track.children, ebmlId.trackUid)),
  );
  if (identifiers.includes(0n) || new Set(identifiers).size !== tracks.length)
    throw Error("Invalid TrackUID inventory");
};
