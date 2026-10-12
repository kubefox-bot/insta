import type * as ts from "typescript/unstable/ast";
import type { SourceProject } from "../../lib/source-analysis/index.ts";
import { readImportReferences } from "../imports/references.ts";
import {
  isLocalImport,
  type ResolutionContext,
  resolveSourceImport,
} from "../imports/resolve.ts";
import { readRepositoryPaths, type SourceFile } from "../project.ts";
import type { ModuleBoundaryFinding } from "./types.ts";

/**
 * Разрешает import references и отдельно диагностирует вычисляемые, неразрешённые локальные и исходники вне analyzed graph; остальные разрешённые targets сохраняет.
 */
const readTargets = ({
  sourceFile,
  context,
  analyzedPaths,
}: Readonly<{
  sourceFile: ts.SourceFile;
  context: ResolutionContext;
  analyzedPaths: ReadonlySet<string>;
}>) => {
  const targets: string[] = [];
  const findings: ModuleBoundaryFinding[] = [];
  for (const { specifier } of readImportReferences(sourceFile)) {
    if (specifier === undefined) {
      findings.push({
        rule: "dynamic-module-import",
        path: context.path,
        message: "Вычисляемый import/require нельзя проверить статически",
      });
      continue;
    }
    const target = resolveSourceImport(specifier, context);
    if (
      target &&
      /\.(?:[cm]?[tj]sx?|svelte)$/u.test(target) &&
      !analyzedPaths.has(target)
    ) {
      findings.push({
        rule: "unanalyzed-local-import",
        path: context.path,
        message: `Локальный исходник вне анализируемого графа: ${target}`,
      });
    } else if (target) targets.push(target);
    else if (isLocalImport(specifier, context))
      findings.push({
        rule: "unresolved-local-import",
        path: context.path,
        message: `Не удалось разрешить локальный импорт ${specifier}`,
      });
  }
  return { targets, findings };
};
/**
 * Строит граф по production файлам, исключая tests/stories, и всем их виртуальным скриптам; compiler заимствован и не закрывается, ошибки чтения пробрасываются.
 */
export const readImportGraph = async ({
  files,
  compiler,
  cwd,
}: Readonly<{
  files: readonly SourceFile[];
  compiler: SourceProject;
  cwd: string;
}>) => {
  const sourcePaths = new Set(readRepositoryPaths(cwd));
  const graph = new Map<string, string[]>();
  const findings: ModuleBoundaryFinding[] = [];
  const productionFiles = files.filter(
    (file) =>
      !/(?:^|\/)__tests__(?:\/|$)|\.(?:test|spec|stories)\.[tj]sx?$/u.test(
        file.path,
      ),
  );
  const analyzedPaths = new Set(productionFiles.map((file) => file.path));
  for (const file of productionFiles) {
    const targets: string[] = [];
    for (const sourceFile of await compiler.sourceFiles(file.absolutePath)) {
      const imports = readTargets({
        sourceFile,
        context: {
          path: file.path,
          cwd,
          project: compiler.project,
          sourcePaths,
        },
        analyzedPaths,
      });
      findings.push(...imports.findings);
      targets.push(...imports.targets);
    }
    graph.set(file.path, targets);
  }
  return { graph, findings };
};
