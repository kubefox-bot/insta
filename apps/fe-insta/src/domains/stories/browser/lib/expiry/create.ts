import type { StoryClock } from "../../ports/types";
import { maximumTimerDelayMs } from "./conts";
/** Владеет одним отменяемым сроком: длинное ожидание разбивает по пределу таймера и сверяет clock перед вызовом expire. */
export const createExpiry = (clock: StoryClock) => {
  const owner = {
    /** Предоставляет пустую очистку до приобретения первого таймера. */
    release: () => {},
  };
  /** Освобождает текущий срок и заменяет очистку безопасной пустой операцией. */
  const release = () => {
    owner.release();
    owner.release = () => {};
  };
  return {
    release,
    /** Заменяет прежний срок и планирует повторные проверки до expiresAt; release отменяет ожидание и блокирует поздний callback. */
    schedule: ({
      expiresAt,
      expire,
    }: Readonly<{ expiresAt: number; expire: () => void }>) => {
      release();
      let active = true;
      /** Предоставляет пустую отмену до получения первого handle от clock. */
      let cancel = () => {};
      /** Проверяет актуальность и остаток срока; вызывает expire один раз либо планирует ограниченное следующее ожидание. */
      const check = () => {
        if (!active) return;
        const remaining = expiresAt - clock.now();
        if (remaining <= 0) {
          active = false;
          expire();
          return;
        }
        cancel = clock.schedule(
          check,
          Math.min(maximumTimerDelayMs, remaining),
        );
      };
      owner.release = () => {
        active = false;
        cancel();
      };
      cancel = clock.schedule(
        check,
        Math.min(maximumTimerDelayMs, Math.max(0, expiresAt - clock.now())),
      );
    },
  };
};
