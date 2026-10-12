import { Result } from "@bloodyowl/boxed";
/**
 * Владеет синхронными обработчиками очистки приватных данных; предоставляет бросающую и
 * Result-форму общей попытки.
 */
export const createPrivateLifecycle = ({
  clearPrivate,
}: Readonly<{ clearPrivate: () => void }>) => {
  const owners = new Set<() => void>();
  /**
   * Вызывает базовую и все зарегистрированные очистки, продолжая после отдельных ошибок; общий
   * отказ содержит все причины.
   */
  const clear = () => {
    const failures: unknown[] = [];
    for (const cleanup of [clearPrivate, ...owners]) {
      try {
        cleanup();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length)
      throw new AggregateError(failures, "Private resources cleanup failed");
  };
  return {
    /**
     * Добавляет cleanup владельца и возвращает снятие регистрации без выполнения самого
     * cleanup.
     */
    register: (cleanup: () => void) => {
      owners.add(cleanup);
      return () => owners.delete(cleanup);
    },
    clear,
    /**
     * Выполняет общую очистку, сохраняя AggregateError в Result вместо исключения.
     */
    attemptClear: () => {
      try {
        clear();
        return Result.Ok(undefined);
      } catch (cause) {
        return Result.Error(cause);
      }
    },
  };
};
