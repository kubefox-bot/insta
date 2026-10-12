import { basename } from "node:path";
import * as ts from "typescript/unstable/ast";
import type { ArchitectureFinding } from "./types.ts";

/**
 * Проверяет разрешённую синтаксическую форму значения conts: литералы, ссылки, массивы/объекты без spread и допустимые обёртки; ссылки не вычисляются и чистота их значений не доказывается.
 */
const isStaticValue = (expression: ts.Expression): boolean => {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAssertionExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return isStaticValue(expression.expression);
  }
  if (
    ts.isStringLiteral(expression) ||
    ts.isNumericLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression) ||
    ts.isIdentifier(expression) ||
    expression.kind === ts.SyntaxKind.RegularExpressionLiteral ||
    expression.kind === ts.SyntaxKind.TrueKeyword ||
    expression.kind === ts.SyntaxKind.FalseKeyword ||
    expression.kind === ts.SyntaxKind.NullKeyword
  )
    return true;
  if (ts.isPropertyAccessExpression(expression))
    return isStaticProperty(expression);
  if (ts.isPrefixUnaryExpression(expression)) {
    return (
      (expression.operator === ts.SyntaxKind.MinusToken ||
        expression.operator === ts.SyntaxKind.PlusToken) &&
      isStaticValue(expression.operand)
    );
  }
  if (ts.isArrayLiteralExpression(expression)) {
    return expression.elements.every(
      (element) => !ts.isSpreadElement(element) && isStaticValue(element),
    );
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return expression.properties.every(
      (property) =>
        (ts.isPropertyAssignment(property) &&
          (!ts.isComputedPropertyName(property.name) ||
            isStaticValue(property.name.expression)) &&
          isStaticValue(property.initializer)) ||
        ts.isShorthandPropertyAssignment(property),
    );
  }
  return false;
};

/**
 * Разрешает property chain с допустимым основанием, исключая член env; это синтаксический фильтр, без разрешения символов.
 */
const isStaticProperty = (expression: ts.PropertyAccessExpression): boolean =>
  expression.name.text !== "env" && isStaticValue(expression.expression);

/**
 * Собирает простые имена верхнеуровневых const для проверки локальных экспортов; destructuring bindings сюда не входят.
 */
const declaredConsts = (sourceFile: ts.SourceFile): ReadonlySet<string> =>
  new Set(
    sourceFile.statements
      .filter(ts.isVariableStatement)
      .filter(
        (statement) => statement.declarationList.flags & ts.NodeFlags.Const,
      )
      .flatMap((statement) => statement.declarationList.declarations)
      .flatMap((declaration) =>
        ts.isIdentifier(declaration.name) ? [declaration.name.text] : [],
      ),
  );

/**
 * Определяет запрещённую форму conts: side-effect import, re-export/type export, не-const либо неразрешённый initializer; локальный export должен ссылаться на объявленный const.
 */
const isInvalidStatement = (
  statement: ts.Statement,
  constNames: ReadonlySet<string>,
): boolean => {
  if (ts.isImportDeclaration(statement)) return !statement.importClause;
  if (ts.isEmptyStatement(statement)) return false;
  if (ts.isExportDeclaration(statement)) {
    if (
      statement.isTypeOnly ||
      statement.moduleSpecifier ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    )
      return true;
    return statement.exportClause.elements.some(
      (element) =>
        element.isTypeOnly ||
        element.name.text === "default" ||
        !constNames.has(element.propertyName?.text ?? element.name.text),
    );
  }
  if (!ts.isVariableStatement(statement)) return true;
  if (!(statement.declarationList.flags & ts.NodeFlags.Const)) return true;
  return statement.declarationList.declarations.some(
    (declaration) =>
      !declaration.initializer || !isStaticValue(declaration.initializer),
  );
};

/**
 * Для conts.ts выдаёт одну диагностику при любой недопустимой statement-форме; отсутствующий AST и остальные имена пропускает, семантическую чистоту импортов не устанавливает.
 */
export const checkContsFilePurity = (
  path: string,
  sourceFile: ts.SourceFile | undefined,
): ArchitectureFinding[] => {
  if (!sourceFile || basename(path) !== "conts.ts") return [];
  const constNames = declaredConsts(sourceFile);
  if (
    !sourceFile.statements.some((statement) =>
      isInvalidStatement(statement, constNames),
    )
  ) {
    return [];
  }
  return [
    {
      rule: "conts-file-purity",
      path,
      message:
        "`conts.ts` содержит только инициализированные const-значения без объявлений функций и изменяемых bindings.",
      example: "export const PAGE_SIZE = 20;",
    },
  ];
};
