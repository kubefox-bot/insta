import { initialsLength, neutralInitials } from "../conts";

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Формирует инициалы из первых графем username в верхнем регистре; для пустого имени возвращает нейтральный знак. */
export const initials = (username: string | null): string => {
  if (!username) return neutralInitials;
  return Array.from(segmenter.segment(username), ({ segment }) => segment)
    .slice(0, initialsLength)
    .join("")
    .toUpperCase();
};
