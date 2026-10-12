import { Result } from "@bloodyowl/boxed";
/**
 * Подписывается на error и unhandledrejection, не читая URL, reason, stack или исходную
 * ошибку и не отменяя события. Возвращённый cleanup снимает обе подписки; исключения
 * record изолируются.
 */
export const observeBrowserErrors = (record: () => void) => {
  // Read no ErrorEvent URL, reason, stack or original Error. Normal UI handlers
  // retain their ownership and cancellation behavior.
  /**
   * Сообщает только факт браузерной ошибки, не извлекая её содержимое; исключение
   * диагностического callback не выходит наружу.
   */
  const observe = () => {
    Result.fromExecution(record);
  };
  window.addEventListener("error", observe);
  window.addEventListener("unhandledrejection", observe);
  return () => {
    window.removeEventListener("error", observe);
    window.removeEventListener("unhandledrejection", observe);
  };
};
