import type { Result } from "@bloodyowl/boxed";
/** Извлекает успешный результат теста с обязательным narrowing, сохраняя неожиданный отказ. */
export const expectSuccess = <T, E>(result: Result<T, E>): T => {
  if (result.isError()) throw new Error(String(result.getError()));
  return result.get();
};
/** Проверяет ветку отказа до сравнения публичного кода. */
export const errorOf = <T, E>(result: Result<T, E>): string => {
  if (result.isOk()) throw new Error("Expected failure");
  return String(result.getError());
};
