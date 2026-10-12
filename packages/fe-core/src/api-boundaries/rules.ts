import * as ts from "typescript/unstable/ast";

import type { ApiBoundaryFinding, ApiBoundaryRule } from "./types.ts";

/**
 * Создаёт диагностическую запись API boundary с правилом, путём и примером; фильтрация исключений выполняется отдельно.
 */
export const finding = (
  rule: ApiBoundaryRule,
  path: string,
  message: string,
  example: string,
): ApiBoundaryFinding => ({ example, message, path, rule });

/**
 * Выполняет синхронный preorder обход AST с visit для каждого узла; возврат callback не останавливает обход.
 */
export const walk = (node: ts.Node, visit: (child: ts.Node) => void): void => {
  visit(node);
  node.forEachChild((child) => {
    walk(child, visit);
    return undefined;
  });
};

/**
 * Сужает узел до вызова import(); литеральность аргумента проверяется отдельно.
 */
export const isDynamicImport = (node: ts.Node): node is ts.CallExpression =>
  ts.isCallExpression(node) && ts.isImportExpression(node.expression);

/**
 * Распознаёт вызов идентификатора require по синтаксису; локальное затенение этого имени здесь не разрешается.
 */
export const isCommonJsRequire = (node: ts.Node): node is ts.CallExpression =>
  ts.isCallExpression(node) &&
  ts.isIdentifier(node.expression) &&
  node.expression.text === "require";

/**
 * Возвращает содержимое строкового литерала/шаблона без подстановок; вычисляемое выражение даёт undefined.
 */
export const literalModuleSpecifier = (
  node: ts.Expression,
): string | undefined =>
  ts.isStringLiteralLikeNode(node) ? node.text : undefined;

/**
 * Находит вложенное as/type assertion, пропуская скобки между ними; типы и их совместимость не вычисляет.
 */
export const isDoubleAssertion = (node: ts.Node): boolean => {
  if (!ts.isAsExpression(node) && !ts.isTypeAssertion(node)) {
    return false;
  }

  let expression = node.expression;
  while (ts.isParenthesizedExpression(expression)) {
    expression = expression.expression;
  }
  return ts.isAsExpression(expression) || ts.isTypeAssertion(expression);
};

/**
 * Распознаёт явный AnyKeyword AST; выведенный или алиасный any этим предикатом не обнаруживается.
 */
export const isAnyType = (node: ts.Node): boolean =>
  node.kind === ts.SyntaxKind.AnyKeyword;
