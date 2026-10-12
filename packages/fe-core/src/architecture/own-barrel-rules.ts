import { dirname } from "node:path";
import type * as ts from "typescript/unstable/ast";
import { readImportReferences } from "./imports/references.ts";
import {
  type ResolutionContext,
  resolveSourceImport,
} from "./imports/resolve.ts";
import type { ArchitectureFinding } from "./types.ts";
/**
 * Диагностирует разрешённый импорт собственного родительского index.ts/tsx; точные entrypoints и тестовые/stories файлы исключены, неразрешённые импорты не дают находку.
 */
export const checkOwnBarrelImports = ({
  path,
  sourceFile,
  cwd,
  project,
  sourcePaths,
  entrypointFiles,
}: ResolutionContext & {
  sourceFile: ts.SourceFile | undefined;
  entrypointFiles: ReadonlySet<string>;
}): ArchitectureFinding[] => {
  if (
    !sourceFile ||
    entrypointFiles.has(path) ||
    /(?:^|\/)__tests__(?:\/|$)/u.test(path) ||
    /\.(?:test|spec|stories)\.tsx?$/u.test(path)
  )
    return [];
  const invalid = readImportReferences(sourceFile).some(({ specifier }) => {
    const target = resolveSourceImport(specifier ?? "", {
      path,
      cwd,
      project,
      sourcePaths,
    });
    return (
      target &&
      /^index\.tsx?$/u.test(target.split("/").at(-1) ?? "") &&
      path.startsWith(`${dirname(target)}/`) &&
      path !== target
    );
  });
  return invalid
    ? [
        {
          rule: "own-barrel-import",
          path,
          message:
            "Внутренний файл не должен импортировать public index своего модуля.",
          example: 'import { value } from "./value";',
        },
      ]
    : [];
};
