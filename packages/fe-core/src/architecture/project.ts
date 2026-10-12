import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { listRepositoryPaths } from "../git/repository/index";
import { createSourceProject } from "../lib/source-analysis/index.ts";
export type SourceFile = {
  absolutePath: string;
  path: string;
  sourceText: string;
};

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".svelte"] as const;

/**
 * Заменяет обратные разделители на / для сопоставления путей; файловую систему не читает.
 */
const toPosixPath = (path: string): string => path.replaceAll("\\", "/");

/**
 * Приводит разделители к / и удаляет один начальный ./ и конечный /; не разрешает .. и symlink.
 */
export const normalizeDirectory = (path: string): string =>
  toPosixPath(path).replace(/^\.\//u, "").replace(/\/$/u, "");

/**
 * Ограничивает архитектурный scan расширениями .ts, .tsx и .svelte; содержимое и поддерживаемый синтаксис здесь не проверяются.
 */
const isSourceFile = (path: string): boolean =>
  SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension));

/**
 * Получает Git-пути, обрезает пробелы, исключает отсутствующие на диске и сортирует; ошибки Git/диска не скрываются.
 */
export const readRepositoryPaths = (cwd: string): string[] => {
  return listRepositoryPaths({ cwd })
    .map((path) => toPosixPath(path.trim()))
    .filter(Boolean)
    .filter((path) => existsSync(resolve(cwd, path)))
    .sort();
};

/**
 * Читает UTF-8 файлы выбранного sourceRoot из Git-набора, возвращая относительный и абсолютный путь; ошибки чтения пробрасываются.
 */
export const readSourceFiles = (
  cwd: string,
  sourceRoot: string,
): SourceFile[] =>
  readRepositoryPaths(cwd)
    .filter(
      (path) =>
        (sourceRoot === "." || path.startsWith(`${sourceRoot}/`)) &&
        isSourceFile(path),
    )
    .map((path) => ({
      absolutePath: resolve(cwd, path),
      path,
      sourceText: readFileSync(resolve(cwd, path), "utf8"),
    }));

/**
 * Публичный alias создания виртуального source project; получатель закрывает возвращённый api после анализа.
 */
export const createArchitectureProject = createSourceProject;
