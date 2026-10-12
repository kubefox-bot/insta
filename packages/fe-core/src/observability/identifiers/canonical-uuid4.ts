import { UUID_V4_PATTERN } from "../contracts/conts";

/** Возвращает UUID v4 в нижнем регистре; отсутствие или недопустимый формат преобразует в undefined. */
export const canonicalUuid4 = (
  value: string | undefined,
): string | undefined => {
  const normalized = value?.toLowerCase();
  return normalized && UUID_V4_PATTERN.test(normalized)
    ? normalized
    : undefined;
};
