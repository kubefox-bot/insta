import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import {
  isTestSourcePath,
  normalizeApiBoundaryConfig,
  validateScannedConfigFiles,
} from "./config.ts";
import {
  checkClientGraph,
  checkTestSourceImports,
  checkTransportImports,
  reachableProductionModules,
} from "./module-graph.ts";
import { createCompleteProject, readRepositoryFiles } from "./project.ts";
import { checkSourceRules } from "./source-rules.ts";
import type {
  ApiBoundaryConfig,
  ApiBoundaryFinding,
  ApiBoundaryResult,
} from "./types.ts";

/**
 * Нормализует конфигурацию и Git-backed источники, дополняет локальный граф и запускает source/transport/browser проверки; закрывает compiler после source rules в finally, возвращает все находки.
 */
export const checkApiBoundaries = async (
  config: ApiBoundaryConfig,
  options: { cwd?: string } = {},
): Promise<ApiBoundaryResult> => {
  const cwd = realpathSync(resolve(options.cwd ?? process.cwd()));
  const normalizedConfig = normalizeApiBoundaryConfig(config, cwd);
  const repositoryFiles = readRepositoryFiles(cwd);
  const sourcePaths = new Set(repositoryFiles.map(({ path }) => path));
  validateScannedConfigFiles(normalizedConfig, sourcePaths);
  const completeProject = await createCompleteProject(cwd, repositoryFiles);
  const testSourcePaths = new Set(
    completeProject.files
      .filter(({ path }) => isTestSourcePath(path))
      .map(({ path }) => path),
  );
  const modules = reachableProductionModules(
    completeProject.modules,
    normalizedConfig.sourceRoot,
  );

  const findings: ApiBoundaryFinding[] = [];
  try {
    for (const [path, module] of modules) {
      for (const script of module.scriptModules ?? [module]) {
        await checkSourceRules({
          module: script,
          config: normalizedConfig,
          findings,
          path,
          project: completeProject.compiler.project,
          scopeBindings: module.httpClientBindings,
          symbolAtLocation: completeProject.compiler.symbolAtLocation,
        });
      }
    }
  } finally {
    await completeProject.compiler.close();
  }
  checkTestSourceImports(modules, testSourcePaths, findings);
  checkTransportImports(modules, normalizedConfig, findings);
  checkClientGraph(modules, normalizedConfig, findings);

  return { findings };
};
