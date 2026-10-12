import { horizonPolicy } from "./conts";
import type { PresentationEvidence } from "./types";
/**
 * Вычисляет максимальный конец аудио и видео в целых наносекундах, умноженных на частоту
 * аудио; это избегает потери точности при сравнении дорожек.
 */
export const contentEnd = ({
  audio,
  video,
}: Pick<PresentationEvidence, "audio" | "video">) => {
  const ends = [
    ...audio.map(
      (frame) =>
        BigInt(frame.timestampNs) * BigInt(horizonPolicy.audioSampleRate) +
        BigInt(frame.samples) * BigInt(horizonPolicy.nanosecondsPerSecond),
    ),
    ...video.map(
      (frame) =>
        (BigInt(frame.timestampNs) + BigInt(frame.durationNs ?? 0)) *
        BigInt(horizonPolicy.audioSampleRate),
    ),
  ];
  return ends.reduce((maximum, end) => (end > maximum ? end : maximum), 0n);
};
/**
 * Проверяет, что последний видеокадр начинается до горизонта; при неизвестной
 * длительности ограничивает допустимое удержание последнего кадра.
 */
export const terminalHoldValid = ({
  video,
  horizon,
}: Readonly<{ video: PresentationEvidence["video"]; horizon: bigint }>) => {
  const last = video.at(-1);
  if (!last) return false;
  const timestamp =
    BigInt(last.timestampNs) * BigInt(horizonPolicy.audioSampleRate);
  if (timestamp >= horizon) return false;
  return (
    last.durationNs !== null ||
    horizon - timestamp <=
      BigInt(horizonPolicy.maxTerminalHoldMs) *
        BigInt(horizonPolicy.nanosecondsPerMs) *
        BigInt(horizonPolicy.audioSampleRate)
  );
};
