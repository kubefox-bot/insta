import type { SourceProject } from "../lib/source-analysis/index.ts";
import { domainFirstNextPreset } from "../presets/domain-first-next.ts";
import { checkContsFilePurity } from "./conts-file-rules.ts";
import { checkEnvironmentAccess } from "./environment-rules.ts";
import {
  checkIndexBoundary,
  checkProductionTestImports,
  checkRuntimeExportCount,
  checkTestPlacement,
  checkTypesFilePurity,
} from "./module-rules.ts";
import { checkOwnBarrelImports } from "./own-barrel-rules.ts";
import {
  createArchitectureProject,
  normalizeDirectory,
  readSourceFiles,
  type SourceFile,
} from "./project.ts";
import {
  checkConfigNaming,
  checkConfigsFolderNaming,
  checkDirectExternalImport,
  checkDtoLayout,
  checkDtoNaming,
  checkHelpersFolderNaming,
  checkMapperLayout,
  checkMapperNaming,
  checkPublicExportCount,
  checkServiceNaming,
  checkUtilityFileNaming,
} from "./rules.ts";
import { checkServiceFactory } from "./service-factory-rules.ts";
import type {
  ArchitectureConfig,
  ArchitectureFinding,
  ArchitectureMode,
  ArchitecturePreset,
  ArchitectureResult,
} from "./types.ts";
import { validateOwnerFiles } from "./validate-config.ts";

type ResolvedArchitectureConfig = {
  disallowedExternalImports: readonly string[];
  exportCountAllowlist: ReadonlySet<string>;
  environmentFiles: ReadonlySet<string>;
  entrypointFiles: ReadonlySet<string>;
  maxRuntimeExports: number;
  mode: ArchitectureMode;
  preset: ArchitecturePreset;
  resultBoundary: string;
  sourceRoot: string;
};

/**
 * Применяет preset/defaults, нормализует корни и проверяет точные файлы владельцев на диске; ошибочная конфигурация прерывает проверку.
 */
const resolveConfig = (
  config: ArchitectureConfig,
  cwd: string,
): ResolvedArchitectureConfig => ({
  disallowedExternalImports:
    config.disallowedExternalImports ??
    domainFirstNextPreset.disallowedExternalImports,
  exportCountAllowlist: new Set(
    config.exportCountAllowlist ?? domainFirstNextPreset.exportCountAllowlist,
  ),
  environmentFiles: new Set(
    validateOwnerFiles(
      config.environmentFiles,
      "environmentFiles",
      normalizeDirectory(config.sourceRoot),
      cwd,
    ),
  ),
  entrypointFiles: new Set(
    validateOwnerFiles(
      config.entrypointFiles,
      "entrypointFiles",
      normalizeDirectory(config.sourceRoot),
      cwd,
    ),
  ),
  maxRuntimeExports: domainFirstNextPreset.maxRuntimeExports,
  mode: config.mode ?? "warn",
  preset: config.preset ?? "domain-first-next",
  resultBoundary: normalizeDirectory(
    config.resultBoundary ?? domainFirstNextPreset.resultBoundary,
  ),
  sourceRoot: normalizeDirectory(config.sourceRoot),
});

/**
 * Собирает диагностики имён, размещения и прямых импортов для domain-first-next; module-style пропускает этот набор.
 */
const runPathRules = (
  files: readonly SourceFile[],
  config: ResolvedArchitectureConfig,
): ArchitectureFinding[] =>
  config.preset === "module-style"
    ? []
    : [
        ...files.flatMap((file) => checkUtilityFileNaming(file.path)),
        ...files.flatMap((file) => checkHelpersFolderNaming(file.path)),
        ...files.flatMap((file) => checkConfigsFolderNaming(file.path)),
        ...files.flatMap((file) => checkServiceNaming(file.path)),
        ...files.flatMap((file) => checkConfigNaming(file.path)),
        ...files.flatMap((file) => checkMapperNaming(file.path)),
        ...files.flatMap((file) => checkMapperLayout(file.path)),
        ...files.flatMap((file) => checkDtoNaming(file.path)),
        ...files.flatMap((file) => checkDtoLayout(file.path)),
        ...files.flatMap((file) => checkTestPlacement(file.path)),
        ...files.flatMap((file) =>
          checkDirectExternalImport(file.path, file.sourceText, config),
        ),
      ];

/**
 * Проверяет каждый TS/Svelte script выбранным набором AST-правил; module-style добавляет env, own-barrel и service-factory, результаты накапливаются без изменения исходников.
 */
const runAstRules = async (
  files: readonly SourceFile[],
  compiler: SourceProject,
  config: ResolvedArchitectureConfig,
  cwd: string,
): Promise<ArchitectureFinding[]> => {
  const findings: ArchitectureFinding[] = [];
  const sourcePaths = new Set(files.map(({ path }) => path));

  for (const file of files) {
    for (const sourceFile of await compiler.sourceFiles(file.absolutePath)) {
      const project = compiler.project;
      if (config.preset === "module-style") {
        findings.push(
          ...checkIndexBoundary(file.path, sourceFile),
          ...checkTypesFilePurity(file.path, sourceFile),
          ...checkContsFilePurity(file.path, sourceFile),
          ...checkProductionTestImports(file.path, sourceFile),
          ...checkOwnBarrelImports({
            path: file.path,
            sourceFile,
            cwd,
            project,
            sourcePaths,
            entrypointFiles: config.entrypointFiles,
          }),
          ...checkServiceFactory(file.path, sourceFile),
          ...(await checkEnvironmentAccess({
            path: file.path,
            sourceFile,
            project,
            owners: config.environmentFiles,
            symbolAtLocation: compiler.symbolAtLocation,
          })),
        );
        continue;
      }
      findings.push(
        ...checkPublicExportCount(file.path, sourceFile, config),
        ...checkIndexBoundary(file.path, sourceFile),
        ...checkTypesFilePurity(file.path, sourceFile),
        ...checkContsFilePurity(file.path, sourceFile),
        ...checkRuntimeExportCount(file.path, sourceFile, config),
        ...checkProductionTestImports(file.path, sourceFile),
      );
    }
  }
  return findings;
};

/**
 * Читает исходники репозитория, запускает path/AST проверки и возвращает находки с режимом; созданный compiler API закрывается в finally даже при ошибке.
 */
export const checkArchitecture = async (
  config: ArchitectureConfig,
  options: { cwd?: string } = {},
): Promise<ArchitectureResult> => {
  const cwd = options.cwd ?? process.cwd();
  const resolvedConfig = resolveConfig(config, cwd);
  const files = readSourceFiles(cwd, resolvedConfig.sourceRoot);
  const findings = runPathRules(files, resolvedConfig);
  const compiler = await createArchitectureProject(cwd, files);

  try {
    findings.push(...(await runAstRules(files, compiler, resolvedConfig, cwd)));
  } finally {
    await compiler.api.close();
  }

  return { findings, mode: resolvedConfig.mode };
};
