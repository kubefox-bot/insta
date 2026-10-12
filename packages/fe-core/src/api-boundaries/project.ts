import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import type { Project } from "typescript/unstable/async";
import { listRepositoryPaths } from "../git/repository/index";
import {
  createSourceProject,
  selectAliasTargets,
} from "../lib/source-analysis/index.ts";
import { isApiBoundarySourcePath as isSourceFile } from "./config.ts";
import type {
  ParsedModule,
  SourceFile,
  TsconfigPaths,
} from "./module.types.ts";
import { parseModule } from "./module-parser.ts";
import {
  RESOLVABLE_EXTENSIONS,
  RUNTIME_JAVASCRIPT_EXTENSIONS,
} from "./project/conts.ts";
import { normalizePath, toPosixPath } from "./source-paths.ts";

type ModuleResolutionOptions = {
  cwd: string;
  sourcePath: string;
  specifier: string;
  tsconfigPaths: TsconfigPaths;
  sourcePaths: ReadonlySet<string>;
};

/**
 * Получает существующие Git-backed JS/TS/Svelte исходники, нормализует и сортирует пути; текст файлов читает создание compiler project.
 */
export const readRepositoryFiles = (cwd: string): SourceFile[] => {
  return listRepositoryPaths({ cwd })
    .map((path) => normalizePath(path.trim()))
    .filter(Boolean)
    .filter(isSourceFile)
    .filter((path) => existsSync(resolve(cwd, path)))
    .sort()
    .map((path) => ({ absolutePath: resolve(cwd, path), path }));
};

/**
 * Допускает существующий локальный исходник внутри cwd без symlink, исключая node_modules; внешний realpath и symlink дают ошибку, отсутствующий файл — undefined.
 */
const sourceFileForLocalTarget = (
  cwd: string,
  target: string,
): SourceFile | undefined => {
  const configuredPath = resolve(cwd, target);
  if (!existsSync(configuredPath)) return undefined;

  const absolutePath = realpathSync(configuredPath);
  const path = normalizePath(relative(cwd, absolutePath));
  if (!path || path === ".." || path.startsWith("../")) {
    throw new Error(
      `Локальный API import ${target} не должен выходить за пределы consumer cwd.`,
    );
  }
  if (path.startsWith("node_modules/") || !isSourceFile(path)) {
    return undefined;
  }
  if (absolutePath !== configuredPath) {
    throw new Error(
      `Локальный API import ${target} не должен проходить через symlink.`,
    );
  }
  return { absolutePath, path };
};

/**
 * Разбирает все виртуальные scripts файлов и объединяет imports/HTTP bindings под исходным путём, сохраняя отдельные scriptModules для scope-aware проверок.
 */
const parseModules = async (
  cwd: string,
  files: readonly SourceFile[],
  compiler: Awaited<ReturnType<typeof createProject>>,
  tsconfigPaths: TsconfigPaths,
): Promise<Map<string, ParsedModule>> => {
  const sourcePaths = new Set(files.map(({ path }) => path));
  const modules = new Map<string, ParsedModule>();
  for (const file of files) {
    const scripts = await compiler.sourceFiles(file.absolutePath);
    const parsed = scripts.map((sourceFile) =>
      parseModule(sourceFile, (specifier) =>
        resolveModule({
          cwd,
          sourcePath: file.absolutePath,
          sourcePaths,
          specifier,
          tsconfigPaths,
        }),
      ),
    );
    const [first] = parsed;
    if (!first) continue;
    modules.set(file.path, {
      ...first,
      imports: parsed.flatMap((module) => module.imports),
      httpClientBindings: parsed.flatMap((module) => module.httpClientBindings),
      scriptModules: parsed,
    });
  }
  return modules;
};

/**
 * Дополняет принадлежащую сборщику карту файлов новыми разрешёнными local targets; возвращает признак роста, ошибки проверки путей пробрасывает.
 */
const addReferencedLocalSources = (
  cwd: string,
  files: Map<string, SourceFile>,
  modules: ReadonlyMap<string, ParsedModule>,
): boolean => {
  let added = false;
  for (const module of modules.values()) {
    for (const { target } of module.imports) {
      if (!target || files.has(target)) continue;
      const source = sourceFileForLocalTarget(cwd, target);
      if (source) {
        files.set(source.path, source);
        added = true;
      }
    }
  }
  return added;
};

/**
 * Расширяет project до неподвижной точки локальных импортов; закрывает промежуточные/ошибочные compiler instances, успешный compiler возвращает с обязанностью close у вызывающего.
 */
export const createCompleteProject = async (
  cwd: string,
  repositoryFiles: readonly SourceFile[],
): Promise<{
  compiler: Awaited<ReturnType<typeof createProject>>;
  files: readonly SourceFile[];
  modules: Map<string, ParsedModule>;
}> => {
  const filesByPath = new Map(
    repositoryFiles.map((file) => [file.path, file] as const),
  );
  for (;;) {
    const files = [...filesByPath.values()].sort((left, right) =>
      left.path.localeCompare(right.path),
    );
    const compiler = await createProject(cwd, files);
    try {
      const modules = await parseModules(
        cwd,
        files,
        compiler,
        compiler.tsconfigPaths,
      );
      if (!addReferencedLocalSources(cwd, filesByPath, modules)) {
        return { compiler, files, modules };
      }
    } catch (error) {
      await compiler.close();
      throw error;
    }
    await compiler.close();
  }
};

/**
 * Читает тексты и создаёт виртуальный compiler с allowJs без checkJs, добавляя close и paths resolution; возвращённым ресурсом владеет вызывающий.
 */
const createProject = async (cwd: string, files: readonly SourceFile[]) => {
  const compiler = await createSourceProject(
    cwd,
    files.map((file) => ({
      ...file,
      sourceText: readFileSync(file.absolutePath, "utf8"),
    })),
    { allowJs: true, checkJs: false },
  );
  return {
    ...compiler,
    /**
     * Закрывает принадлежащий проекту TypeScript API; возвращает Promise освобождения вызывающему владельцу.
     */
    close: () => compiler.api.close(),
    tsconfigPaths: readTsconfigPaths(cwd, compiler.project),
  };
};

/**
 * Выбирает baseUrl, затем pathsBasePath, затем cwd как основу API alias resolution; ничего не читает с диска.
 */
const resolutionBaseUrl = (
  cwd: string,
  compilerOptions: Readonly<Record<string, unknown>>,
): string => {
  if (typeof compilerOptions.baseUrl === "string") {
    return resolve(cwd, compilerOptions.baseUrl);
  }
  if (typeof compilerOptions.pathsBasePath === "string") {
    return compilerOptions.pathsBasePath;
  }
  return cwd;
};

/**
 * Извлекает из compiler options только paths с массивами строк и базу resolution; некорректные entries пропускаются, исходные options не меняются.
 */
const readTsconfigPaths = (cwd: string, project: Project): TsconfigPaths => {
  const compilerOptions = project.compilerOptions as unknown as Record<
    string,
    unknown
  >;
  const configuredPaths = compilerOptions?.paths;
  const paths =
    configuredPaths && typeof configuredPaths === "object"
      ? Object.fromEntries(
          Object.entries(configuredPaths as Record<string, unknown>).flatMap(
            ([alias, targets]) =>
              Array.isArray(targets) &&
              targets.every((target) => typeof target === "string")
                ? [[alias, targets] as const]
                : [],
          ),
        )
      : {};
  return { baseUrl: resolutionBaseUrl(cwd, compilerOptions), paths };
};

/**
 * Добавляет exact extension candidate, допустимые typed/runtime варианты и index кандидаты в переданный список; порядок определяет первый найденный target.
 */
const appendResolutionCandidates = (
  path: string,
  candidates: string[],
): void => {
  const explicitExtension = RESOLVABLE_EXTENSIONS.find((extension) =>
    path.endsWith(extension),
  );
  if (explicitExtension) {
    candidates.push(normalizePath(path));
    if (!RUNTIME_JAVASCRIPT_EXTENSIONS.includes(explicitExtension as never)) {
      return;
    }
  }
  const basePath =
    explicitExtension &&
    RUNTIME_JAVASCRIPT_EXTENSIONS.includes(explicitExtension as never)
      ? path.slice(0, -explicitExtension.length)
      : path;
  for (const extension of RESOLVABLE_EXTENSIONS) {
    candidates.push(normalizePath(`${basePath}${extension}`));
  }
  for (const extension of RESOLVABLE_EXTENSIONS) {
    candidates.push(normalizePath(`${basePath}/index${extension}`));
  }
};

/**
 * Разворачивает выбранные exact/wildcard paths targets относительно cwd/baseUrl и дополняет caller-owned список кандидатов.
 */
const appendAliasCandidates = ({
  cwd,
  specifier,
  paths,
  baseUrl,
  candidates,
}: {
  cwd: string;
  specifier: string;
  paths: Readonly<Record<string, readonly string[]>>;
  baseUrl: string;
  candidates: string[];
}): void => {
  for (const target of selectAliasTargets({ specifier, paths })) {
    appendResolutionCandidates(resolve(cwd, baseUrl, target), candidates);
  }
};

/**
 * Строит новый упорядоченный список для относительного импорта либо tsconfig alias; обычные внешние пакеты без alias не разрешает.
 */
const resolutionCandidates = ({
  cwd,
  sourcePath,
  specifier,
  tsconfigPaths,
}: Omit<ModuleResolutionOptions, "sourcePaths">): string[] => {
  const candidates: string[] = [];

  if (specifier.startsWith(".")) {
    appendResolutionCandidates(
      resolve(dirname(sourcePath), specifier),
      candidates,
    );
  } else {
    appendAliasCandidates({
      cwd,
      specifier,
      paths: tsconfigPaths.paths,
      baseUrl: tsconfigPaths.baseUrl,
      candidates,
    });
  }

  return candidates;
};

/**
 * Возвращает первый candidate из известных sourcePaths либо существующий на диске; проверка realpath/локального владения выполняется при включении target в project.
 */
const resolveModule = ({
  cwd,
  sourcePath,
  specifier,
  tsconfigPaths,
  sourcePaths,
}: ModuleResolutionOptions): string | undefined =>
  resolutionCandidates({ cwd, sourcePath, specifier, tsconfigPaths })
    .map((candidate) =>
      normalizePath(candidate.replace(`${toPosixPath(cwd)}/`, "")),
    )
    .find(
      (candidate) =>
        sourcePaths.has(candidate) || existsSync(resolve(cwd, candidate)),
    );
