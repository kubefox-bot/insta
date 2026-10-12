import { createArchitectureProject, readSourceFiles } from "../project.ts";
import { parseModuleBoundariesConfig } from "./config.ts";
import { checkForbiddenDependencies } from "./dependency-rules.ts";
import { readImportGraph } from "./graph.ts";
import { checkGraphRules } from "./rules.ts";
import type { ModuleBoundariesConfig, ModuleBoundaryResult } from "./types.ts";
/**
 * Валидирует конфигурацию, строит production import graph и объединяет graph/dependency диагностики; пустой sourceRoot — ошибка, созданный compiler закрывается в finally.
 */
export const runModuleBoundariesCheck = async (
  configuration: ModuleBoundariesConfig,
  { cwd = process.cwd() }: Readonly<{ cwd?: string }> = {},
): Promise<ModuleBoundaryResult> => {
  const config = parseModuleBoundariesConfig(configuration);
  const files = readSourceFiles(cwd, config.sourceRoot);
  if (!files.length)
    throw new Error(`Нет исходников внутри ${config.sourceRoot}`);
  const compiler = await createArchitectureProject(cwd, files);
  try {
    const { graph, findings } = await readImportGraph({ files, compiler, cwd });
    return {
      findings: [
        ...findings,
        ...checkGraphRules({ config, graph }),
        ...checkForbiddenDependencies(graph, config.forbiddenDependencies),
      ],
    };
  } finally {
    await compiler.api.close();
  }
};
