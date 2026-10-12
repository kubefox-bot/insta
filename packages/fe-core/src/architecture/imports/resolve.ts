import { dirname, extname, relative, resolve } from "node:path";
import type { Project } from "typescript/unstable/async";
import { selectAliasTargets } from "../../lib/source-analysis/index.ts";
import { isCanonicalPackageAlias } from "./canonical-package.ts";
import { sourceExtensions, typedExtensions } from "./conts.ts";
import { workspaceImportTargets } from "./workspace.ts";

/**
 * Формирует порядок поиска exact path, typed замены .js/.jsx, исходных расширений и index-файлов; существование проверяет вызывающий код.
 */
const candidatePaths = (base: string): string[] => {
  const extension = extname(base);
  const typedExtension = typedExtensions[extension];
  const typedEquivalent = typedExtension
    ? `${base.slice(0, -extension.length)}${typedExtension}`
    : undefined;
  return [
    base,
    ...(typedEquivalent ? [typedEquivalent] : []),
    ...sourceExtensions.map((sourceExtension) => `${base}${sourceExtension}`),
    ...sourceExtensions.map((sourceExtension) =>
      resolve(base, `index${sourceExtension}`),
    ),
  ];
};

/**
 * Берёт выбранные paths targets из compiler options и разрешает их относительно pathsBasePath/baseUrl/cwd.
 */
const aliasBases = (
  specifier: string,
  project: Project,
  cwd: string,
): string[] => {
  const options = project.compilerOptions as unknown as {
    paths?: Record<string, string[]>;
    baseUrl?: string;
    pathsBasePath?: string;
  };
  const base = options.pathsBasePath ?? options.baseUrl ?? cwd;
  return selectAliasTargets({ specifier, paths: options.paths ?? {} }).map(
    (target) => resolve(base, target),
  );
};

export type ResolutionContext = {
  path: string;
  cwd: string;
  project: Project;
  sourcePaths: ReadonlySet<string>;
};

/**
 * Ищет первый относительный/alias/workspace target среди известных sourcePaths с поддерживаемыми расширениями; неразрешённый specifier даёт undefined.
 */
export const resolveSourceImport = (
  specifier: string,
  { path, cwd, project, sourcePaths }: ResolutionContext,
): string | undefined => {
  const bases = specifier.startsWith(".")
    ? [resolve(cwd, dirname(path), specifier)]
    : [
        ...aliasBases(specifier, project, cwd),
        ...workspaceImportTargets({ specifier, cwd, sourcePaths }),
      ];
  return bases
    .flatMap(candidatePaths)
    .map((candidate) => relative(cwd, candidate).replaceAll("\\", "/"))
    .find((candidate) => sourcePaths.has(candidate));
};

/**
 * Отличает относительные/workspace/неканонические paths aliases от внешних пакетов, чтобы неразрешённые локальные импорты стали диагностикой.
 */
export const isLocalImport = (
  specifier: string,
  { project, cwd, sourcePaths }: ResolutionContext,
): boolean => {
  if (specifier.startsWith(".")) return true;
  if (workspaceImportTargets({ specifier, cwd, sourcePaths }).length > 0)
    return true;
  const aliases = aliasBases(specifier, project, cwd);
  return (
    aliases.length > 0 &&
    !aliases.every((target) =>
      isCanonicalPackageAlias({ specifier, target, cwd }),
    )
  );
};
