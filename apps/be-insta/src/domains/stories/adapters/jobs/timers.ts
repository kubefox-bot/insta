import type { StoryJobTimers } from "./types";
/**
 * Предоставляет системные таймеры scheduler с явными функциями отмены, которыми владеет
 * вызывающий jobs lifecycle.
 */
export const createJobTimers = (): StoryJobTimers => ({
  /** Регистрирует периодический callback и отдаёт владельцу отмену интервала. */
  every: (callback, ms) => {
    const timer = setInterval(callback, ms);
    return () => clearInterval(timer);
  },
  /** Регистрирует одноразовый watchdog callback и отдаёт владельцу отмену таймера. */
  after: (callback, ms) => {
    const timer = setTimeout(callback, ms);
    return () => clearTimeout(timer);
  },
});
