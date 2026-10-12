import { basename } from "node:path";
import * as ts from "typescript/unstable/ast";

import type { ArchitectureFinding } from "./types.ts";

type RuntimeExportOptions = {
  exportCountAllowlist: ReadonlySet<string>;
  maxRuntimeExports: number;
};

const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:ts|tsx)$/u;

/**
 * Создаёт структурированную диагностику с путём и примером, не выбирая severity и не выполняя вывод.
 */
const finding = (
  rule: string,
  path: string,
  message: string,
  example: string,
): ArchitectureFinding => ({ example, message, path, rule });

/**
 * Распознаёт явный export modifier узла без поиска последующих реэкспортов.
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
 * Выбирает только index.ts и index.tsx для ограничения public entrypoint.
 */
const isIndexFile = (path: string): boolean =>
  basename(path) === "index.ts" || basename(path) === "index.tsx";

/**
 * Выбирает types.ts, props.ts, interfaces.ts и *.types.ts для type-only контракта.
 */
const isTypesFile = (path: string): boolean => {
  const fileName = basename(path);

  return (
    ["types.ts", "props.ts", "interfaces.ts"].includes(fileName) ||
    fileName.endsWith(".types.ts")
  );
};

/**
 * Распознаёт суффиксы .test/.spec для TS/TSX; принадлежность __tests__ проверяется отдельно.
 */
const isTestFile = (path: string): boolean => TEST_FILE_PATTERN.test(path);

/**
 * Требует общий import type либо непустой набор только type specifiers без default binding; side-effect import не считается type-only.
 */
const isTypeOnlyImport = (statement: ts.ImportDeclaration): boolean => {
  const clause = statement.importClause;
  if (!clause) return false;
  if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return true;
  if (clause.name) return false;

  const bindings = clause.namedBindings;
  return Boolean(
    bindings &&
      ts.isNamedImports(bindings) &&
      bindings.elements.length > 0 &&
      bindings.elements.every((element) => element.isTypeOnly),
  );
};

/**
 * Распознаёт export type либо непустой набор только type specifiers; обычный wildcard не считается type-only.
 */
const isTypeOnlyExport = (statement: ts.ExportDeclaration): boolean => {
  if (statement.isTypeOnly) return true;
  if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
    return false;
  }

  return (
    statement.exportClause.elements.length > 0 &&
    statement.exportClause.elements.every((element) => element.isTypeOnly)
  );
};

/**
 * Разрешает только named export from без имени default; пустой named список допустим, wildcard и локальный export исключены.
 */
const isExplicitReExport = (statement: ts.Statement): boolean =>
  ts.isExportDeclaration(statement) &&
  statement.moduleSpecifier !== undefined &&
  statement.exportClause !== undefined &&
  ts.isNamedExports(statement.exportClause) &&
  statement.exportClause.elements.every(
    (element) => element.name.text !== "default",
  );

/**
 * Разрешает type/interface объявления, type-only imports/exports и пустые statements, не выполняя семантическое разрешение типов.
 */
const isTypesStatement = (statement: ts.Statement): boolean =>
  ts.isTypeAliasDeclaration(statement) ||
  ts.isInterfaceDeclaration(statement) ||
  (ts.isImportDeclaration(statement) && isTypeOnlyImport(statement)) ||
  (ts.isExportDeclaration(statement) && isTypeOnlyExport(statement)) ||
  ts.isEmptyStatement(statement);

/**
 * Даёт 0 целиком type-only экспорту, число specifiers смешанному named export и 1 остальным формам; это синтаксический счётчик.
 */
const exportDeclarationCount = (statement: ts.ExportDeclaration): number => {
  if (isTypeOnlyExport(statement)) return 0;
  if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
    return statement.exportClause.elements.length;
  }
  return 1;
};

/**
 * Выбирает function/class/enum/module declarations как потенциальный runtime export; наличие export проверяется отдельно.
 */
const isRuntimeDeclaration = (statement: ts.Statement): boolean =>
  ts.isFunctionDeclaration(statement) ||
  ts.isClassDeclaration(statement) ||
  ts.isEnumDeclaration(statement) ||
  ts.isModuleDeclaration(statement);

/**
 * Считает экспортированные объявления и export assignments по синтаксису одной statement; type-only реэкспорты исключены.
 */
const runtimeExportCount = (statement: ts.Statement): number => {
  if (ts.isVariableStatement(statement)) {
    return hasExportModifier(statement)
      ? statement.declarationList.declarations.length
      : 0;
  }
  if (ts.isExportAssignment(statement)) return 1;
  if (ts.isExportDeclaration(statement))
    return exportDeclarationCount(statement);
  return isRuntimeDeclaration(statement) && hasExportModifier(statement)
    ? 1
    : 0;
};

/**
 * Суммирует синтаксические runtime exports верхнего уровня без раскрытия экспортируемых модулей.
 */
const countRuntimeExports = (sourceFile: ts.SourceFile): number =>
  sourceFile.statements.reduce(
    (count, statement) => count + runtimeExportCount(statement),
    0,
  );

/**
 * Исключает разрешённые basename, config/DTO и тестовые пути из ограничения числа runtime exports.
 */
const isRuntimeExportCountExempt = (
  path: string,
  allowlist: ReadonlySet<string>,
): boolean => {
  const fileName = basename(path);

  return (
    allowlist.has(fileName) ||
    fileName.endsWith(".config.ts") ||
    fileName.endsWith(".dto.ts") ||
    isTestFile(path) ||
    path.split("/").includes("__tests__")
  );
};

/**
 * Читает литеральный specifier верхнеуровневого import/export from; вызовы import/require здесь не рассматриваются.
 */
const moduleSpecifierText = (statement: ts.Statement): string | undefined => {
  if (ts.isImportDeclaration(statement)) {
    return ts.isStringLiteralLikeNode(statement.moduleSpecifier)
      ? statement.moduleSpecifier.text
      : undefined;
  }
  if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
    return ts.isStringLiteralLikeNode(statement.moduleSpecifier)
      ? statement.moduleSpecifier.text
      : undefined;
  }

  return undefined;
};

/**
 * Распознаёт __tests__ и .test/.spec в тексте specifier; alias до реального файла здесь не разрешается.
 */
const referencesTestSource = (specifier: string): boolean =>
  /(?:^|\/)__tests__(?:\/|$)/u.test(specifier) ||
  /\.(?:test|spec)(?:[./]|$)/u.test(specifier);

/**
 * Выдаёт одну находку, если index.ts/tsx содержит что-либо кроме explicit named re-exports и пустых statements.
 */
export const checkIndexBoundary = (
  path: string,
  sourceFile: ts.SourceFile | undefined,
): ArchitectureFinding[] => {
  if (!sourceFile || !isIndexFile(path)) return [];

  const invalid = sourceFile.statements.some(
    (statement) =>
      !ts.isEmptyStatement(statement) && !isExplicitReExport(statement),
  );
  if (!invalid) return [];

  return [
    finding(
      "index-boundary",
      path,
      "`index.ts` — public boundary: только explicit named/type re-exports, без implementation, default export или export *.",
      'export { createNewsService } from "./news.service";',
    ),
  ];
};

/**
 * Проверяет только поддерживаемые type-file имена и выдаёт одну находку при runtime statement/import/export; отсутствующий AST пропускается.
 */
export const checkTypesFilePurity = (
  path: string,
  sourceFile: ts.SourceFile | undefined,
): ArchitectureFinding[] => {
  if (!sourceFile || !isTypesFile(path)) return [];
  if (sourceFile.statements.every(isTypesStatement)) return [];

  return [
    finding(
      "types-file-purity",
      path,
      "Type-файл содержит runtime code/import/export. Оставь только type aliases, interfaces и type-only imports/re-exports.",
      'export type { News } from "./news.types";',
    ),
  ];
};

/**
 * Сравнивает синтаксическое число exports с лимитом, сохраняя allowlist/config/DTO/test исключения; возвращает одну находку при превышении.
 */
export const checkRuntimeExportCount = (
  path: string,
  sourceFile: ts.SourceFile | undefined,
  options: RuntimeExportOptions,
): ArchitectureFinding[] => {
  if (
    !sourceFile ||
    isRuntimeExportCountExempt(path, options.exportCountAllowlist)
  ) {
    return [];
  }

  const count = countRuntimeExports(sourceFile);
  if (count <= options.maxRuntimeExports) return [];

  return [
    finding(
      "runtime-export-count",
      path,
      `В implementation-файле найдено runtime exports: ${count}; максимум: ${options.maxRuntimeExports}.`,
      "оставь небольшой public surface и вынеси соседнюю ответственность в отдельный модуль",
    ),
  ];
};

/**
 * Диагностирует TS/TSX .test/.spec файлы вне сегмента __tests__; содержимое теста не анализируется.
 */
export const checkTestPlacement = (path: string): ArchitectureFinding[] => {
  if (!isTestFile(path) || path.split("/").includes("__tests__")) return [];

  return [
    finding(
      "test-placement",
      path,
      "Тесты должны жить в module-local `__tests__/`, чтобы production layout оставался явным.",
      "src/domains/news/__tests__/news.service.test.ts",
    ),
  ];
};

/**
 * В production AST ищет статические import/export specifiers, явно указывающие тестовые пути; aliases и динамические вызовы этот шаг не разрешает.
 */
export const checkProductionTestImports = (
  path: string,
  sourceFile: ts.SourceFile | undefined,
): ArchitectureFinding[] => {
  if (
    !sourceFile ||
    isTestFile(path) ||
    path.split("/").includes("__tests__")
  ) {
    return [];
  }

  const importsTest = sourceFile.statements
    .map(moduleSpecifierText)
    .some((specifier) => specifier && referencesTestSource(specifier));
  if (!importsTest) return [];

  return [
    finding(
      "production-test-import",
      path,
      "Production code не должен импортировать test sources или `__tests__`.",
      "вынеси reusable fixture за production source boundary",
    ),
  ];
};
