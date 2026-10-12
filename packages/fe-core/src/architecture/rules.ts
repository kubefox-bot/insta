import { basename, dirname } from "node:path";
import * as ts from "typescript/unstable/ast";

import type { ArchitectureFinding } from "./types.ts";

type RuleOptions = {
  disallowedExternalImports: readonly string[];
  exportCountAllowlist: ReadonlySet<string>;
  resultBoundary: string;
};

const SOURCE_EXTENSIONS = [".ts", ".tsx"] as const;

/**
 * Создаёт находку legacy path/style правила с сообщением и примером; никаких изменений исходника не выполняет.
 */
const finding = (
  rule: string,
  path: string,
  message: string,
  example: string,
): ArchitectureFinding => ({ example, message, path, rule });

/**
 * Сопоставляет целый сегмент POSIX-пути, исключая совпадения по подстроке.
 */
const hasSegment = (path: string, segment: string): boolean =>
  path.split("/").includes(segment);

/**
 * Выбирает TS/TSX для legacy path/style правил; Svelte этим предикатом не включается.
 */
const isSourceFile = (path: string): boolean =>
  SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension));

/**
 * Экранирует метасимволы имени импорта для буквального включения в регулярное выражение.
 */
const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/**
 * Распознаёт прямой export modifier AST-узла для синтаксического подсчёта публичных объявлений.
 */
const hasExportModifier = (node: ts.Node): boolean => {
  const modifiers = (node as { modifiers?: readonly ts.ModifierLike[] })
    .modifiers;

  return Boolean(
    modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    ),
  );
};

/**
 * Выбирает непосредственные arrow/function/class initializers; вызовы фабрик и обёрнутые expressions не считаются.
 */
const isFunctionLikeVariable = (declaration: ts.VariableDeclaration): boolean =>
  Boolean(
    declaration.initializer &&
      (ts.isArrowFunction(declaration.initializer) ||
        ts.isFunctionExpression(declaration.initializer) ||
        ts.isClassExpression(declaration.initializer)),
  );

/**
 * Считает прямые exported function/class declarations и переменные с callable/class initializer; отдельные реэкспорты не раскрывает.
 */
const countPublicFunctionAndClassExports = (
  sourceFile: ts.SourceFile | undefined,
): number => {
  if (!sourceFile) {
    return 0;
  }

  let count = 0;

  for (const statement of sourceFile.statements) {
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement)) &&
      hasExportModifier(statement)
    ) {
      count += 1;
      continue;
    }

    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      count += statement.declarationList.declarations.filter(
        isFunctionLikeVariable,
      ).length;
    }
  }

  return count;
};

/**
 * Предлагает конкретное имя ответственности только для utils.ts/tsx; остальные файлы оставляет без находок.
 */
export const checkUtilityFileNaming = (path: string): ArchitectureFinding[] => {
  const fileName = basename(path);

  if (fileName !== "utils.ts" && fileName !== "utils.tsx") {
    return [];
  }

  return [
    finding(
      "file-naming",
      path,
      "`utils.ts` скрывает ответственность файла. Используй конкретное действие в имени.",
      "src/domains/news/lib/get-news-title.ts",
    ),
  ];
};

/**
 * Диагностирует сегмент helpers в пути согласно domain-first-next naming policy.
 */
export const checkHelpersFolderNaming = (
  path: string,
): ArchitectureFinding[] => {
  if (!hasSegment(path, "helpers")) {
    return [];
  }

  return [
    finding(
      "folder-naming",
      path,
      "Папка `helpers/` слишком размытая. Используй `lib/` и конкретные имена файлов.",
      "lib/read-news-page-search-params.ts",
    ),
  ];
};

/**
 * Диагностирует сегмент configs и предлагает config согласно legacy preset; не проверяет содержимое каталога.
 */
export const checkConfigsFolderNaming = (
  path: string,
): ArchitectureFinding[] => {
  if (!hasSegment(path, "configs")) {
    return [];
  }

  return [
    finding(
      "folder-naming",
      path,
      "Папка `configs/` не используется. Для статичной конфигурации ожидается `config/`.",
      "config/api-sources.config.ts",
    ),
  ];
};

/**
 * Диагностирует -service.ts и .facade/-facade.ts и предлагает .service.ts; назначение файла по содержимому не выводит.
 */
export const checkServiceNaming = (path: string): ArchitectureFinding[] => {
  const fileName = basename(path);
  const isInvalidServiceLikeFile =
    fileName.endsWith("-service.ts") ||
    fileName.endsWith(".facade.ts") ||
    fileName.endsWith("-facade.ts");

  if (!isInvalidServiceLikeFile || fileName.endsWith(".service.ts")) {
    return [];
  }

  return [
    finding(
      "service-naming",
      path,
      "Фасадный service-файл должен называться `<name>.service.ts`.",
      "news.service.ts",
    ),
  ];
};

/**
 * Для имени с config без учёта регистра требует суффикс .config.ts; это naming heuristic, а не анализ конфигурации.
 */
export const checkConfigNaming = (path: string): ArchitectureFinding[] => {
  const fileName = basename(path);

  if (!/config/iu.test(fileName) || fileName.endsWith(".config.ts")) {
    return [];
  }

  return [
    finding(
      "config-naming",
      path,
      "Статичная конфигурация должна называться `<name>.config.ts`.",
      "asset.config.ts",
    ),
  ];
};

/**
 * Для map-* или *.mapper.ts предлагает *.map.ts; остальные имена не классифицирует как мапперы.
 */
export const checkMapperNaming = (path: string): ArchitectureFinding[] => {
  const fileName = basename(path);

  if (
    !(fileName.startsWith("map-") || fileName.endsWith(".mapper.ts")) ||
    fileName.endsWith(".map.ts")
  ) {
    return [];
  }

  return [
    finding(
      "mapper-naming",
      path,
      "Мапперы называем в формате `*.map.ts`.",
      "news-collection.map.ts",
    ),
  ];
};

/**
 * Для *.map.ts требует непосредственного родителя lib или server/lib, возвращая одну находку при другом размещении.
 */
export const checkMapperLayout = (path: string): ArchitectureFinding[] => {
  if (!basename(path).endsWith(".map.ts")) {
    return [];
  }

  const parent = dirname(path).replaceAll("\\", "/");
  const isAllowedMapperPath =
    parent.endsWith("/lib") || parent.endsWith("/server/lib");

  if (isAllowedMapperPath) {
    return [];
  }

  return [
    finding(
      "mapper-layout",
      path,
      "Мапперы должны лежать в `lib/` или `server/lib/`.",
      "src/domains/news/server/lib/news-collection.map.ts",
    ),
  ];
};

/**
 * Для basename с dto требует .dto.ts; семантическую роль объявлений не определяет.
 */
export const checkDtoNaming = (path: string): ArchitectureFinding[] => {
  const fileName = basename(path);

  if (!fileName.includes("dto") || fileName.endsWith(".dto.ts")) {
    return [];
  }

  return [
    finding(
      "dto-naming",
      path,
      "DTO-файлы должны иметь суффикс `.dto.ts`.",
      "dto/news/news-api.dto.ts",
    ),
  ];
};

/**
 * Для *.dto.ts проверяет dto/<entity>/<entity>-*.dto.ts относительно первого dto-сегмента пути.
 */
export const checkDtoLayout = (path: string): ArchitectureFinding[] => {
  const fileName = basename(path);

  if (!fileName.endsWith(".dto.ts")) {
    return [];
  }

  const segments = path.split("/");
  const dtoIndex = segments.indexOf("dto");
  const entity = segments[dtoIndex + 1];
  const isExpectedLayout =
    dtoIndex !== -1 &&
    entity !== undefined &&
    segments[dtoIndex + 2] === fileName &&
    fileName.startsWith(`${entity}-`);

  if (isExpectedLayout) {
    return [];
  }

  return [
    finding(
      "dto-layout",
      path,
      "DTO ожидается в формате `dto/<entity>/<entity>-*.dto.ts`.",
      "src/domains/news/dto/news/news-api.dto.ts",
    ),
  ];
};

/**
 * Ищет запрещённые from/import() по регулярному выражению в TS/TSX вне result boundary; комментарии и строки не отделяет AST-анализом.
 */
export const checkDirectExternalImport = (
  path: string,
  sourceText: string,
  options: Pick<RuleOptions, "disallowedExternalImports" | "resultBoundary">,
): ArchitectureFinding[] => {
  if (!isSourceFile(path) || path.startsWith(`${options.resultBoundary}/`)) {
    return [];
  }

  const imports = options.disallowedExternalImports.map(escapeRegExp).join("|");
  const hasDirectImport = new RegExp(
    `from\\s+["'](?:${imports})["']|import\\s*\\(\\s*["'](?:${imports})["']\\s*\\)`,
    "u",
  ).test(sourceText);

  if (!hasDirectImport) {
    return [];
  }

  return [
    finding(
      "oxide-import-boundary",
      path,
      "`oxide.ts` импортируем только внутри `src/core/toolings/result`. Остальной код использует core alias layer.",
      'import { ResultService, type Result } from "@/core/toolings";',
    ),
  ];
};

/**
 * Применяет legacy лимит одного прямого function/class export с исключениями для allowlist/config/DTO/tests; реэкспорты этим правилом не считаются.
 */
export const checkPublicExportCount = (
  path: string,
  sourceFile: ts.SourceFile | undefined,
  options: Pick<RuleOptions, "exportCountAllowlist">,
): ArchitectureFinding[] => {
  const fileName = basename(path);
  const isAllowed =
    options.exportCountAllowlist.has(fileName) ||
    fileName.endsWith(".config.ts") ||
    fileName.endsWith(".dto.ts") ||
    fileName.endsWith(".test.ts") ||
    fileName.endsWith(".test.tsx") ||
    hasSegment(path, "__tests__");

  if (!isSourceFile(path) || isAllowed) {
    return [];
  }

  const exportCount = countPublicFunctionAndClassExports(sourceFile);

  if (exportCount <= 1) {
    return [];
  }

  return [
    finding(
      "export-count",
      path,
      `В обычном implementation-файле найдено публичных function/class exports: ${exportCount}.`,
      "оставь один public function/class на файл или вынеси соседнюю ответственность отдельно",
    ),
  ];
};
