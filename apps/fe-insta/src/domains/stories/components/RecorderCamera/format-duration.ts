import type { Locale } from "../../../../lib/i18n/index";
import {
  millisecondsPerSecond,
  timerDigits,
  timerFractionDigits,
} from "./conts";

/** Сохраняет точность лимита до миллисекунд и локаль, не округляя его вниз. */
export const formatDuration = ({
  durationMs,
  locale,
}: Readonly<{ durationMs: number; locale: Locale }>) => {
  const seconds = durationMs / millisecondsPerSecond;
  const options = {
    useGrouping: false,
    maximumFractionDigits: timerFractionDigits,
  };
  return {
    seconds: new Intl.NumberFormat(locale, options).format(seconds),
    timer:
      "00:" +
      new Intl.NumberFormat(locale, {
        ...options,
        minimumIntegerDigits: timerDigits,
      }).format(seconds),
  };
};
