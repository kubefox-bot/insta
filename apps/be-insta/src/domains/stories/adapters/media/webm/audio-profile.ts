import { ebmlId, opusEncoding, webmPolicy } from "./conts";
import { one, readFloat, readUnsigned } from "./reader";
import type { Element } from "./types";
import { UnsupportedWebm } from "./unsupported";

/**
 * Проверяет фиксированный профиль OpusHead, число каналов и mapping 0; preskip/gain
 * отклоняет, чтобы не принять неподдержанные изменения аудио timeline.
 */
const verifyOpusHead = ({
  bytes,
  config,
  channels,
}: Readonly<{ bytes: Uint8Array; config: Element; channels: number }>) => {
  const header = bytes.subarray(config.data, config.end);
  if (header.length !== webmPolicy.opusHeaderBytes)
    throw new UnsupportedWebm("OpusHead size");
  const signature = new TextDecoder().decode(
    header.subarray(0, opusEncoding.signatureBytes),
  );
  if (
    signature !== opusEncoding.signature ||
    header[opusEncoding.versionOffset] !== opusEncoding.version ||
    header[opusEncoding.channelsOffset] !== channels ||
    header[opusEncoding.mappingOffset] !== 0
  )
    throw new UnsupportedWebm("OpusHead profile");
  const view = new DataView(
    header.buffer,
    header.byteOffset,
    header.byteLength,
  );
  if (
    view.getUint16(opusEncoding.preskipOffset, true) !== 0 ||
    view.getInt16(opusEncoding.gainOffset, true) !== 0
  )
    throw new UnsupportedWebm("Opus preskip/gain");
};
/**
 * Требует допустимое число каналов, 48 kHz и совместимый OpusHead, возвращая проверенные
 * audio параметры.
 */
export const readAudioProfile = ({
  bytes,
  track,
}: Readonly<{ bytes: Uint8Array; track: Element }>) => {
  const audio = one(track.children, ebmlId.audio);
  const channels = readUnsigned(bytes, one(audio.children, ebmlId.channels));
  if (
    channels < 1 ||
    channels > webmPolicy.maxChannels ||
    readFloat(bytes, one(audio.children, ebmlId.rate)) !== webmPolicy.sampleRate
  )
    throw new UnsupportedWebm("Opus audio profile");
  verifyOpusHead({
    bytes,
    config: one(track.children, ebmlId.private),
    channels,
  });
  return { channels, width: 0, height: 0 };
};
