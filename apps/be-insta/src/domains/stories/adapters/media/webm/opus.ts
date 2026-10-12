import {
  opusConfig,
  opusEncoding,
  opusFrameSamples,
  webmPolicy,
} from "./conts";

/**
 * Выбирает число samples кадра по Opus SILK/hybrid/CELT конфигурации при фиксированной
 * decode rate.
 */
const frameSamples = (config: number) => {
  if (config >= opusConfig.celtStart)
    return opusFrameSamples.celt[config & opusConfig.celtMask];
  if (config >= opusConfig.hybridStart)
    return opusFrameSamples.hybrid[config & opusConfig.hybridMask];
  return opusFrameSamples.silk[config & opusConfig.silkMask];
};
/**
 * Извлекает число кадров Opus packet по TOC-режиму, включая произвольный счётчик второго
 * байта.
 */
const frameCount = (packet: Uint8Array) => {
  const mode = (packet[0] ?? 0) & opusEncoding.modeMask;
  if (mode === 0) return 1;
  if (mode === opusEncoding.arbitraryFrameMode)
    return (packet[1] ?? 0) & opusEncoding.frameCountMask;
  return opusEncoding.twoFrames;
};
// RFC6716 section3: samples/frame at the fixed48kHz Opus decode rate.
/**
 * Вычисляет длительность Opus packet в samples 48 kHz, отклоняя неполный заголовок,
 * нулевое число кадров и превышение packet duration budget.
 */
export const opusSamples = (packet: Uint8Array) => {
  const toc = packet[0];
  if (toc === undefined || packet.length < opusEncoding.twoFrames)
    throw Error("Incomplete Opus packet");
  const samples = frameSamples(toc >> opusEncoding.configShift);
  const count = frameCount(packet);
  if (!samples || count === 0 || count * samples > webmPolicy.maxOpusSamples)
    throw Error("Opus packet duration");
  return count * samples;
};
