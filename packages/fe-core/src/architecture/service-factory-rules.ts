import { basename } from "node:path";
import * as ts from "typescript/unstable/ast";
import type { ArchitectureFinding } from "./types.ts";

/**
 * Проверяет явный export modifier statement; отдельные export declarations учитываются другим шагом.
 */
const exported = (statement: ts.Statement): boolean =>
  Boolean(
    (statement as { modifiers?: readonly ts.ModifierLike[] }).modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    ),
  );

/**
 * Распознаёт function declaration либо единственную переменную с непосредственным function/arrow initializer заданного имени; обёрнутые callable expressions не поддерживает.
 */
const callableFactory = (
  statement: ts.Statement,
  expected: string,
): boolean => {
  if (ts.isFunctionDeclaration(statement))
    return statement.name?.text === expected;
  if (
    !ts.isVariableStatement(statement) ||
    statement.declarationList.declarations.length !== 1
  )
    return false;
  const [declaration] = statement.declarationList.declarations;
  return (
    ts.isIdentifier(declaration.name) &&
    declaration.name.text === expected &&
    Boolean(
      declaration.initializer &&
        (ts.isArrowFunction(declaration.initializer) ||
          ts.isFunctionExpression(declaration.initializer)),
    )
  );
};

/**
 * Возвращает runtime-имена named exports; type-only исключает, wildcard/namespace формы помечает * для отклонения контракта factory.
 */
const declaredExportNames = (statement: ts.ExportDeclaration): string[] => {
  if (statement.isTypeOnly) return [];
  if (!statement.exportClause || !ts.isNamedExports(statement.exportClause))
    return ["*"];
  return statement.exportClause.elements
    .filter((element) => !element.isTypeOnly)
    .map((element) => element.name.text);
};

/**
 * Извлекает runtime export names из верхнеуровневой statement; неподдерживаемые формы получают маркеры, а не теряются из проверки.
 */
const runtimeExportNames = (statement: ts.Statement): string[] => {
  if (ts.isExportAssignment(statement)) return ["default"];
  if (ts.isExportDeclaration(statement)) return declaredExportNames(statement);
  if (
    !exported(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement)
  )
    return [];
  if (ts.isVariableStatement(statement))
    return statement.declarationList.declarations.map((declaration) =>
      ts.isIdentifier(declaration.name) ? declaration.name.text : "<binding>",
    );
  if (
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isEnumDeclaration(statement)
  )
    return [statement.name?.text ?? "<anonymous>"];
  return ["<unknown>"];
};

/**
 * Для .service.ts требует единственный runtime export create<Name>Service с непосредственным callable объявлением; нарушения сворачивает в одну диагностику.
 */
export const checkServiceFactory = (
  path: string,
  sourceFile: ts.SourceFile | undefined,
): ArchitectureFinding[] => {
  if (!sourceFile || !basename(path).endsWith(".service.ts")) return [];
  const name = basename(path).replace(/\.service\.ts$/u, "");
  const expected = `create${name
    .split(/[-_]/u)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("")}Service`;
  const runtimeExports = sourceFile.statements.flatMap(runtimeExportNames);
  const valid =
    runtimeExports.length === 1 &&
    runtimeExports[0] === expected &&
    sourceFile.statements.some((statement) =>
      callableFactory(statement, expected),
    );
  return valid
    ? []
    : [
        {
          rule: "service-factory",
          path,
          message: `Service-файл должен экспортировать одну named factory ${expected}.`,
          example: `export const ${expected} = () => ({ run: () => {} });`,
        },
      ];
};
