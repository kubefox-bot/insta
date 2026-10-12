import { posix } from "node:path";
import { isInside } from "../paths.ts";
/**
 * Требует объект, отличный от null и массива, затем копирует его enumerable entries в новый record.
 */
export const record = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label}: ожидается объект`);
  return Object.fromEntries(Object.entries(value));
};
/**
 * Отклоняет первое неизвестное поле с контекстом label; наличие обязательных полей проверяют потребители.
 */
export const exactKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void => {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new TypeError(`${label}: неизвестное поле ${unknown}`);
};
/**
 * Требует точный относительный POSIX-путь без glob, пробелов по краям и dot/пустых сегментов; . разрешён только для sourceRoot.
 */
export const path = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim() ||
    /[\\*?:]/u.test(value)
  )
    throw new TypeError(`${label}: ожидается точный относительный путь`);
  if (value === "." && label === "sourceRoot") return value;
  if (
    posix.isAbsolute(value) ||
    value.split("/").some((part) => part === ".." || part === "." || !part)
  )
    throw new TypeError(`${label}: недопустимый путь`);
  return value;
};
/**
 * Требует массив и возвращает ту же ссылку без копирования; TypeError сохраняет название поля.
 */
export const array = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new TypeError(`${label}: ожидается массив`);
  return value;
};
/**
 * Проверяет массив непустых после trim строк, возвращая новый массив исходных строк без обрезания.
 */
export const strings = (value: unknown, label: string): string[] =>
  array(value, label).map((item) => {
    if (typeof item !== "string" || !item.trim())
      throw new TypeError(`${label}: ожидаются непустые строки`);
    return item;
  });
/**
 * Проверяет каждую пару корней на равенство/вложенность по границе пути; при первом пересечении бросает TypeError.
 */
export const assertDisjoint = (
  values: readonly Readonly<{ root: string }>[],
  label: string,
): void => {
  for (const [index, owner] of values.entries()) {
    if (
      values
        .slice(index + 1)
        .some(
          (other) =>
            isInside(owner.root, other.root) ||
            isInside(other.root, owner.root),
        )
    )
      throw new TypeError(`${label}: корни не должны пересекаться`);
  }
};
