import { z } from "zod";
/**
 * Проверяет серверный переключатель Stories; отсутствие означает enabled. Не определяет
 * upload/lifetime policy: эти значения принадлежат backend.
 */
export const readStoriesAvailability = (
  raw: Readonly<Record<string, string | undefined>>,
) => {
  const result = z
    .enum(["disabled", "enabled"])
    .safeParse(raw.STORIES_MODE ?? "enabled");
  if (!result.success) throw new Error("Invalid Stories availability");
  return result.data === "enabled";
};
