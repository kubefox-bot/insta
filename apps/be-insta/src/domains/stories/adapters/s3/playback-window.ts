import type { SignedPlayback } from "../../ports/storage/types";
import { playbackSignature, storageFailures, storagePolicy } from "./conts";
/**
 * Проверяет фактические параметры подписи провайдера; не выдаёт URL за пределами
 * запрошенной жизни истории или после истечения. Некорректная подпись — сбой
 * провайдера, а не отсутствие истории; URL и секреты в ошибку не попадают.
 */
export const readPlaybackWindow = ({
  url,
  requestedExpiresAt,
  nowMs,
}: Readonly<{
  url: string;
  requestedExpiresAt: number;
  nowMs: number;
}>): SignedPlayback => {
  if (!URL.canParse(url)) throw new Error(storageFailures.signature);
  const parameters = new URL(url).searchParams;
  const dates = parameters.getAll(playbackSignature.dateParameter);
  const durations = parameters.getAll(playbackSignature.expiresParameter);
  const date = dates[0];
  const duration = durations[0];
  if (
    dates.length !== 1 ||
    durations.length !== 1 ||
    !date ||
    !duration ||
    !playbackSignature.datePattern.test(date) ||
    !playbackSignature.secondsPattern.test(duration)
  )
    throw new Error(storageFailures.signature);
  const signedAt = Date.parse(
    date.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
      "$1-$2-$3T$4:$5:$6Z",
    ),
  );
  const seconds = Number(duration);
  if (
    !Number.isSafeInteger(signedAt) ||
    new Date(signedAt)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(".000", "") !== date ||
    !Number.isSafeInteger(seconds) ||
    seconds > storagePolicy.maxPlaybackSeconds
  )
    throw new Error(storageFailures.signature);
  const expiresAt = signedAt + seconds * storagePolicy.millisecondsPerSecond;
  if (!Number.isSafeInteger(expiresAt))
    throw new Error(storageFailures.signature);
  if (expiresAt <= nowMs || expiresAt > requestedExpiresAt)
    return { kind: "expired" };
  return { kind: "signed", url, expiresAt };
};
