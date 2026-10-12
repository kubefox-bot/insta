import { secondsToMs } from "./conts";
/** Переводит Retry-After из секунд или HTTP-даты в неотрицательную задержку относительно now; пустое и неразбираемое значение оставляет неопределённым. */
export const readRetryAfter = ({
  header,
  now,
}: Readonly<{ header: string | null; now: number }>) => {
  if (header === null || header.trim() === "") return undefined;
  const numeric = Number(header);
  const delay = Number.isFinite(numeric)
    ? numeric * secondsToMs
    : Date.parse(header) - now;
  return Number.isFinite(delay) ? Math.max(0, delay) : undefined;
};
