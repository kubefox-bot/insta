/**
 * Ограничивает возврат после смены языка локальным pathname и query. Чужой origin,
 * неоднозначные slash/backslash и ошибки декодирования возвращают пользователя на корень.
 */
export const localeReturnTo = ({
  requested,
  origin,
}: Readonly<{ requested: unknown; origin: string }>) => {
  if (typeof requested !== "string" || requested.trimStart().startsWith("//"))
    return "/";
  try {
    const target = new URL(requested, origin);
    const decodedPath = decodeURIComponent(target.pathname);
    if (
      target.origin !== origin ||
      decodedPath.startsWith("//") ||
      decodedPath.includes("\\")
    )
      return "/";
    return target.pathname + target.search;
  } catch {
    return "/";
  }
};
