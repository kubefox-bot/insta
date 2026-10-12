/**
 * Отличает отсутствующее поле от неверного типа: undefined сохраняется, массив строк возвращается без копии, иначе бросается TypeError с именем поля.
 */
export const readStringArray = (
  value: unknown,
  key: string,
): string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    throw new TypeError(`${key} должен быть массивом строк`);
  }
  return value;
};

/**
 * Требует строку с непробельным содержимым; возвращает исходную строку без trim, при нарушении бросает TypeError с именем поля.
 */
export const readRequiredString = (value: unknown, key: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${key} должен быть непустой строкой`);
  }
  return value;
};
