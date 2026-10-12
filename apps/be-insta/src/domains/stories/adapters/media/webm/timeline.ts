import { webmPolicy } from "./conts";
import type { WebmPacket, WebmTrack } from "./types";
import { UnsupportedWebm } from "./unsupported";

/**
 * Сравнивает timestamps с накопленным числом Opus samples, отклоняя суммарные
 * пропуски/перекрытия сверх шага timestamp scale.
 */
const verifyAudioContinuity = (packets: readonly WebmPacket[]) => {
  const first = packets[0];
  if (!first) throw Error("Empty audio");
  let samples = 0;
  for (const packet of packets) {
    const expected =
      (samples * webmPolicy.nanosecondsPerSecond) / webmPolicy.sampleRate;
    if (
      Math.abs(packet.timestampNs - first.timestampNs - expected) >
      webmPolicy.timestampScaleNs
    )
      throw new UnsupportedWebm("Accumulated audio gap/overlap");
    samples += packet.samples;
  }
};
/**
 * Требует строго возрастающие неотрицательные presentation timestamps; повторные либо
 * обратные метки отклоняет.
 */
const verifyMonotonic = (packets: readonly WebmPacket[]) => {
  let previous = -1;
  for (const packet of packets) {
    if (packet.timestampNs <= previous)
      throw new UnsupportedWebm("Non-monotonic presentation");
    previous = packet.timestampNs;
  }
};
/**
 * Требует пакеты каждой дорожки и монотонность времени; для Opus дополнительно проверяет
 * накопленную непрерывность аудио.
 */
export const verifyTimeline = ({
  packets,
  tracks,
}: Readonly<{
  packets: readonly WebmPacket[];
  tracks: readonly WebmTrack[];
}>) => {
  for (const track of tracks) {
    const own = packets.filter((packet) => packet.track === track.number);
    if (!own.length) throw Error("Missing track packets");
    verifyMonotonic(own);
    if (track.codec === "opus") verifyAudioContinuity(own);
  }
};
