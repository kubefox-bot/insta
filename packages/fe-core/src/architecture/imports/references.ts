import * as ts from "typescript/unstable/ast";
import type { ImportReference } from "./types.ts";

/**
 * Сохраняет литеральный specifier; undefined явно обозначает вычисляемый или отсутствующий аргумент для последующей диагностики.
 */
const reference = (expression: ts.Node | undefined): ImportReference => ({
  specifier:
    expression && ts.isStringLiteralLikeNode(expression)
      ? expression.text
      : undefined,
});
/**
 * Распознаёт import() и синтаксический вызов идентификатора require; локальное затенение require здесь не разрешается.
 */
const isModuleCall = (node: ts.CallExpression): boolean =>
  node.expression.kind === ts.SyntaxKind.ImportKeyword ||
  (ts.isIdentifier(node.expression) && node.expression.text === "require");
/**
 * Извлекает imports/re-exports, import equals, import type и module calls; вычисляемые аргументы сохраняются как reference без specifier.
 */
const fromNode = (node: ts.Node): ImportReference | undefined => {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier
  )
    return reference(node.moduleSpecifier);
  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference)
  )
    return reference(node.moduleReference.expression);
  if (ts.isImportTypeNode(node))
    return reference(
      ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined,
    );
  if (ts.isCallExpression(node) && isModuleCall(node))
    return reference(node.arguments[0]);
  return undefined;
};
/**
 * Рекурсивно собирает синтаксические module references, включая type imports; не выполняет resolution или анализ runtime достижимости.
 */
export const readImportReferences = (
  sourceFile: ts.SourceFile,
): ImportReference[] => {
  const references: ImportReference[] = [];
  /**
   * Добавляет reference текущего узла в локальный список и посещает дочерние AST-узлы; исходное дерево не изменяет.
   */
  const visit = (node: ts.Node): void => {
    const imported = fromNode(node);
    if (imported) references.push(imported);
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return references;
};
