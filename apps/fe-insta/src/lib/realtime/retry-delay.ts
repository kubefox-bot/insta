import { connectionPolicy } from "./conts";
/** Equal jitter сохраняет ненулевую паузу и ограничивает exponential рост независимо от числа попыток. */
export const retryDelay = ({
  attempt,
  random,
}: Readonly<{ attempt: number; random: () => number }>) => {
  const bound = Math.min(
    connectionPolicy.retryCapMs,
    connectionPolicy.retryBaseMs *
      2 **
        Math.min(Math.max(0, attempt - 1), connectionPolicy.retryExponentLimit),
  );
  return Math.floor(bound / 2 + (random() * bound) / 2);
};
