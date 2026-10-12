import {
  malformedSurrogate,
  passwordLimits,
  usernameCharacters,
  usernameLimits,
} from "./conts";
/**
 * Нормализует email для поиска и уникальности, убирая крайние пробелы и регистр; формат
 * адреса здесь не валидируется.
 */
export const emailKey = (value: string) => value.trim().toLowerCase();
/**
 * Приводит username к регистронезависимому ключу поиска и уникальности без изменения
 * отображаемого имени.
 */
export const usernameKey = (value: string) => value.toLowerCase();
/** Проверяет длину и разрешённые символы username, отдельно запрещая перевод строки. */
export const validUsername = (value: string) =>
  value.length >= usernameLimits.min &&
  value.length <= usernameLimits.max &&
  !value.includes("\n") &&
  usernameCharacters.test(value);
/**
 * Отклоняет некорректные surrogate-последовательности и считает длину пароля в Unicode
 * code points, не UTF-16 units.
 */
export const validPassword = (value: string) => {
  if (malformedSurrogate.test(value)) return false;
  const count = Array.from(value).length;
  return (
    count >= passwordLimits.minCodePoints &&
    count <= passwordLimits.maxCodePoints
  );
};
