import { array, exactKeys, record } from "./values.ts";

/**
 * Требует относительный glob без пустых/dot сегментов и запрещённых символов; возвращает исходный шаблон, существование путей не проверяет.
 */
const pattern = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !value ||
    /[\\?:{}[\]]/u.test(value) ||
    value.startsWith("/") ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new TypeError("forbiddenDependencies: нужен относительный glob путь");
  return value;
};
/**
 * Отсутствующий список превращает в [], иначе валидирует закрытые source/target пары и их glob-форму; неверные значения бросают TypeError.
 */
export const parseForbiddenDependencies = (value: unknown) =>
  value === undefined
    ? []
    : array(value, "forbiddenDependencies").map((item) => {
        const rule = record(item, "forbiddenDependency");
        exactKeys(rule, ["source", "target"], "forbiddenDependency");
        return { source: pattern(rule.source), target: pattern(rule.target) };
      });
