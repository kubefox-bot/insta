import { isTestSourcePath } from "./config.ts";
import { addFinding } from "./findings.ts";
import type { ParsedModule } from "./module.types.ts";
import { finding } from "./rules.ts";
import {
  isInside,
  isInsideAny,
  isSvelteKitBrowserSource,
  normalizePath,
} from "./source-paths.ts";
import type { ApiBoundaryConfig, ApiBoundaryFinding } from "./types.ts";

type TransportPathOptions = {
  target: string;
  modules: ReadonlyMap<string, ParsedModule>;
  transportFiles: ReadonlySet<string>;
  transportPackageSpecifiers: ReadonlySet<string>;
  serviceFiles: ReadonlySet<string>;
  visited: Set<string>;
};

/**
 * Считает защищённым точный package specifier и его subpaths по границе /; похожие префиксы не совпадают.
 */
const isTransportReference = (
  specifier: string,
  protectedSpecifiers: ReadonlySet<string>,
): boolean =>
  [...protectedSpecifiers].some(
    (protectedSpecifier) =>
      specifier === protectedSpecifier ||
      specifier.startsWith(`${protectedSpecifier}/`),
  );

type ClientEntryOptions = {
  clientEntry: string;
  modules: ReadonlyMap<string, ParsedModule>;
  protectedRoots: readonly string[];
  config: ApiBoundaryConfig;
  findings: ApiBoundaryFinding[];
};

type ClientVisitOptions = ClientEntryOptions & {
  path: string;
  visited: Set<string>;
};

/**
 * Вне server boundary добавляет находки для прямого package transport или локальной цепочки до raw transport; учитывает scoped exceptions.
 */
const checkTransportModule = ({
  path,
  module,
  serverApiRoots,
  serverApiFiles,
  reachesTransport,
  transportPackageSpecifiers,
  config,
  findings,
}: {
  path: string;
  module: ParsedModule;
  serverApiRoots: readonly string[];
  serverApiFiles: ReadonlySet<string>;
  reachesTransport: (target: string) => boolean;
  transportPackageSpecifiers: ReadonlySet<string>;
  config: ApiBoundaryConfig;
  findings: ApiBoundaryFinding[];
}): void => {
  if (isInsideAny(path, serverApiRoots) || serverApiFiles.has(path)) return;
  for (const reference of module.imports) {
    if (
      !isTransportReference(reference.specifier, transportPackageSpecifiers) &&
      (!reference.target || !reachesTransport(reference.target))
    )
      continue;
    addFinding(
      findings,
      config,
      finding(
        "transport-boundary",
        path,
        "Transport импортируется или реэкспортируется только внутри serverApiRoots или serverApiFiles.",
        "src/api/server/handler.ts",
      ),
    );
  }
};

/**
 * Строит новую карту production модулей, начиная внутри sourceRoot и следуя локальным targets за его пределы; conventional tests исключаются.
 */
export const reachableProductionModules = (
  modules: ReadonlyMap<string, ParsedModule>,
  sourceRoot: string,
): Map<string, ParsedModule> => {
  const reachable = new Map<string, ParsedModule>();
  const visited = new Set<string>();
  /**
   * Обходит локальные targets с visited-защитой, пополняя reachable; тестовые и отсутствующие модули не включаются.
   */
  const visit = (path: string): void => {
    if (visited.has(path) || isTestSourcePath(path)) return;
    visited.add(path);
    const module = modules.get(path);
    if (!module) return;
    reachable.set(path, module);
    for (const { target } of module.imports) {
      if (target) visit(target);
    }
  };

  for (const path of modules.keys()) {
    if (isInside(path, sourceRoot) && !isTestSourcePath(path)) visit(path);
  }
  return reachable;
};

/**
 * Добавляет одну находку на production модуль с разрешённым импортом тестового исходника; scoped exceptions этим правилом не применяются.
 */
export const checkTestSourceImports = (
  modules: ReadonlyMap<string, ParsedModule>,
  testSourcePaths: ReadonlySet<string>,
  findings: ApiBoundaryFinding[],
): void => {
  for (const [path, module] of modules) {
    if (
      module.imports.some(({ target }) => target && testSourcePaths.has(target))
    ) {
      findings.push(
        finding(
          "test-source-import",
          path,
          "Production source не может импортировать conventional test source.",
          "src/features/news/request.ts",
        ),
      );
    }
  }
};

/**
 * Проверяет transport reachability для каждого модуля вне server boundary, нормализуя точные владельцы и используя server services как разрешённую остановку графа.
 */
export const checkTransportImports = (
  modules: ReadonlyMap<string, ParsedModule>,
  config: ApiBoundaryConfig,
  findings: ApiBoundaryFinding[],
): void => {
  const serverApiRoots = config.serverApiRoots.map(normalizePath);
  const serverApiFiles = new Set(
    (config.serverApiFiles ?? []).map(normalizePath),
  );
  const transportFiles = new Set(config.transportFiles.map(normalizePath));
  const transportPackageSpecifiers = new Set(
    config.transportPackageSpecifiers ?? [],
  );
  const serviceFiles = new Set(
    (config.serverServiceFiles ?? []).map(normalizePath),
  );
  /**
   * Запускает независимый поиск raw transport для одного target с новым visited, чтобы обходы разных импортов не влияли друг на друга.
   */
  const reachesTransport = (target: string): boolean =>
    reachesTransportPath({
      target,
      modules,
      transportFiles,
      transportPackageSpecifiers,
      serviceFiles,
      visited: new Set<string>(),
    });

  for (const [path, module] of modules) {
    checkTransportModule({
      path,
      module,
      serverApiRoots,
      serverApiFiles,
      reachesTransport,
      transportPackageSpecifiers,
      config,
      findings,
    });
  }
};

/**
 * Ищет raw local/package transport транзитивно; прекращает обход на service-файле или посещённом узле, изменяя принадлежащий обходу visited.
 */
const reachesTransportPath = ({
  target,
  modules,
  transportFiles,
  transportPackageSpecifiers,
  serviceFiles,
  visited,
}: TransportPathOptions): boolean => {
  if (transportFiles.has(target)) return true;
  if (serviceFiles.has(target) || visited.has(target)) return false;
  visited.add(target);
  return (
    modules.get(target)?.imports.some(
      (reference) =>
        isTransportReference(reference.specifier, transportPackageSpecifiers) ||
        (reference.target
          ? reachesTransportPath({
              target: reference.target,
              modules,
              transportFiles,
              transportPackageSpecifiers,
              serviceFiles,
              visited,
            })
          : false),
    ) ?? false
  );
};

/**
 * Разрешает use server переход для не-SvelteKit browser entry, исключая смешанный use client, generated и raw transport targets.
 */
const isServerActionReference = ({
  target,
  modules,
  config,
  clientEntry,
}: Readonly<{
  target: string;
  modules: ReadonlyMap<string, ParsedModule>;
  config: ApiBoundaryConfig;
  clientEntry: string;
}>): boolean => {
  if (isSvelteKitBrowserSource(clientEntry)) return false;
  const module = modules.get(target);
  return Boolean(
    module?.usesServerDirective &&
      !module.usesClientDirective &&
      !isInside(target, normalizePath(config.generatedRoot)) &&
      !config.transportFiles.map(normalizePath).includes(target),
  );
};

/**
 * Обходит разрешённые local targets от client entry, диагностируя вход в server/generated boundary; server-action исключение останавливает ветку, visited защищает от циклов.
 */
const visitClientModule = ({
  clientEntry,
  modules,
  protectedRoots,
  config,
  findings,
  path,
  visited,
}: ClientVisitOptions): void => {
  if (visited.has(path)) return;
  visited.add(path);
  const module = modules.get(path);
  if (!module) return;
  for (const reference of module.imports) {
    if (!reference.target) continue;
    const isProtectedTarget = protectedRoots.some((root) =>
      isInside(reference.target as string, root),
    );
    if (
      isServerActionReference({
        target: reference.target,
        modules,
        config,
        clientEntry,
      })
    )
      continue;
    const isOutsideProtectedRoot = !protectedRoots.some((root) =>
      isInside(path, root),
    );
    if (isProtectedTarget && isOutsideProtectedRoot) {
      addFinding(
        findings,
        config,
        finding(
          "client-server-import",
          clientEntry,
          "Client module не может импортировать server SDK или generated API code, включая import через barrel.",
          'import type { News } from "@/api/client";',
        ),
      );
      continue;
    }
    visitClientModule({
      clientEntry,
      modules,
      protectedRoots,
      config,
      findings,
      path: reference.target,
      visited,
    });
  }
};

/**
 * Диагностирует client entry внутри защищённого корня и затем проверяет его транзитивные импорты с собственным visited.
 */
const checkClientEntry = ({
  clientEntry,
  modules,
  protectedRoots,
  config,
  findings,
}: ClientEntryOptions): void => {
  if (protectedRoots.some((root) => isInside(clientEntry, root))) {
    addFinding(
      findings,
      config,
      finding(
        "client-server-import",
        clientEntry,
        "use client module нельзя размещать внутри serverApiRoots, serverApiFiles или generatedRoot.",
        "src/app/client-entry.tsx",
      ),
    );
  }
  const visited = new Set<string>();
  visitClientModule({
    clientEntry,
    modules,
    protectedRoots,
    config,
    findings,
    path: clientEntry,
    visited,
  });
};

/**
 * Собирает настроенные client/browser transports, use client и SvelteKit browser entries и проверяет каждый против server/generated boundaries; findings пополняется.
 */
export const checkClientGraph = (
  modules: ReadonlyMap<string, ParsedModule>,
  config: ApiBoundaryConfig,
  findings: ApiBoundaryFinding[],
): void => {
  const protectedRoots = [
    ...config.serverApiRoots.map(normalizePath),
    ...(config.serverApiFiles ?? []).map(normalizePath),
    normalizePath(config.generatedRoot),
  ];
  const clientEntries = new Set(
    [...config.clientEntryFiles, ...(config.browserTransportFiles ?? [])].map(
      normalizePath,
    ),
  );

  for (const [path, module] of modules) {
    if (module.usesClientDirective || isSvelteKitBrowserSource(path))
      clientEntries.add(path);
  }

  for (const clientEntry of clientEntries) {
    checkClientEntry({
      clientEntry,
      modules,
      protectedRoots,
      config,
      findings,
    });
  }
};
