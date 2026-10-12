import { observeOperation } from "./observe-operation";
import { runConfirmedEffect } from "./run-confirmed-effect";
import type {
  BusinessObserver,
  BusinessObserverOptions,
  BusinessOperation,
} from "./types";

/** Связывает наблюдение операций и UI-эффекты после подтверждения с общими runtime, классификатором и диагностикой. */
export const createBusinessObserverService = (
  options: BusinessObserverOptions,
): BusinessObserver => {
  /** Выполняет callback в наблюдаемой операции с заданными зависимостями, сохраняя его результат или исходную ошибку. */
  const observe = <T>(
    name: string,
    callback: (operation: BusinessOperation) => Promise<T>,
  ): Promise<T> => observeOperation(name, callback, options);
  return Object.freeze({
    observeOperation: observe,
    /** Запускает эффект после подтверждения с диагностикой его отказа; подтверждённый бизнес-результат не пересматривается. */
    runConfirmedEffect: (effect, operation, operationId) =>
      runConfirmedEffect(effect, operation, operationId, options.emit),
  });
};
