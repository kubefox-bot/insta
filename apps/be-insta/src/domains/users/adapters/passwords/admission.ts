import { PasswordAdmissionError } from "../../domain/password-admission";
/**
 * Создаёт локальный ограничитель тяжёлой password-работы с FIFO-ожиданием и таймаутом;
 * получивший permit обязан вызвать release.
 */
export const createPasswordAdmission = ({
  concurrent,
  queued,
  queueTimeoutMs,
}: Readonly<{
  concurrent: number;
  queued: number;
  queueTimeoutMs: number;
}>) => {
  type Waiter = {
    readonly grant: () => void;
    readonly timeout: ReturnType<typeof setTimeout>;
  };
  let active = 0;
  const waiting = new Set<Waiter>();
  /**
   * Создаёт идемпотентное освобождение слота: передаёт его первому ожидающему и снимает
   * его таймер либо уменьшает число активных работ.
   */
  const permit = (): (() => void) => {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = waiting.values().next().value;
      if (!next) {
        active -= 1;
        return;
      }
      waiting.delete(next);
      clearTimeout(next.timeout);
      next.grant();
    };
  };
  return {
    /**
     * Занимает слот или ждёт ограниченное время в очереди; переполнение и таймаут
     * отклоняют Promise через PasswordAdmissionError.
     */
    acquire: async (): Promise<() => void> => {
      if (active < concurrent) {
        active += 1;
        return permit();
      }
      if (waiting.size >= queued) throw new PasswordAdmissionError();
      return new Promise((resolve, reject) => {
        const waiter: Waiter = {
          /**
           * Передаёт ожидающему владельцу release занятого слота после снятия его таймера
           * выдающей стороной.
           */
          grant: () => resolve(permit()),
          timeout: setTimeout(() => {
            waiting.delete(waiter);
            reject(new PasswordAdmissionError());
          }, queueTimeoutMs),
        };
        waiting.add(waiter);
      });
    },
  };
};
