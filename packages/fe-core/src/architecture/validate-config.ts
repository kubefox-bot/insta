import { existsSync } from "node:fs";
import { posix, resolve } from "node:path";

/**
 * Принимает только точные нормализованные относительные TS/TSX пути внутри sourceRoot без glob и подъёма; при переданном cwd дополнительно проверяет существование, отсутствие списка даёт [].
 */
export const validateOwnerFiles = (
  value: unknown,
  key: string,
  sourceRoot: string,
  cwd?: string,
): string[] => {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    throw new TypeError(
      `${key} должен быть массивом точных относительных путей`,
    );
  }
  return value.map((file) => {
    const path = file.replaceAll("\\", "/");
    if (
      !path ||
      path !== posix.normalize(path) ||
      posix.isAbsolute(path) ||
      /[*?]/u.test(path) ||
      path.split("/").includes("..") ||
      (sourceRoot !== "." && !path.startsWith(`${sourceRoot}/`)) ||
      !/\.tsx?$/u.test(path) ||
      (cwd && !existsSync(resolve(cwd, path)))
    ) {
      throw new TypeError(
        `${key}: нужен существующий точный исходный файл внутри ${sourceRoot}`,
      );
    }
    return path;
  });
};
