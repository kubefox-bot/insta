import * as ts from "typescript/unstable/ast";

/**
 * Рекурсивно собирает идентификаторы объявленного binding, включая вложенную деструктуризацию и пропуская пустые элементы.
 */
const bindingIdentifiers = (
  name: ts.BindingName | undefined,
): readonly ts.Identifier[] => {
  if (!name) return [];
  if (ts.isIdentifier(name)) return [name];
  return name.elements.flatMap((element) =>
    ts.isBindingElement(element) ? bindingIdentifiers(element.name) : [],
  );
};
/**
 * Собирает локальные runtime-имена default, namespace и named import; явно type-only bindings исключаются.
 */
const importIdentifiers = (
  statement: ts.ImportDeclaration,
): readonly ts.Identifier[] => {
  const clause = statement.importClause;
  if (!clause || clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return [];
  const named = clause.namedBindings;
  const identifiers =
    named && ts.isNamedImports(named)
      ? named.elements
          .filter((element) => !element.isTypeOnly)
          .map((element) => element.name)
      : [];
  return [
    ...(clause.name ? [clause.name] : []),
    ...(named && ts.isNamespaceImport(named) ? [named.name] : []),
    ...identifiers,
  ];
};
/**
 * Строит карту верхнеуровневых runtime bindings для наследования Svelte module scope; вложенные объявления и type-only импорты не включаются.
 */
export const moduleBindings = (
  source: ts.SourceFile,
): ReadonlyMap<string, ts.Identifier> =>
  new Map(
    source.statements
      .flatMap((statement) => {
        if (ts.isImportDeclaration(statement))
          return importIdentifiers(statement);
        if (ts.isVariableStatement(statement))
          return statement.declarationList.declarations.flatMap((declaration) =>
            bindingIdentifiers(declaration.name),
          );
        if (
          (ts.isFunctionDeclaration(statement) ||
            ts.isClassDeclaration(statement) ||
            ts.isEnumDeclaration(statement) ||
            ts.isImportEqualsDeclaration(statement)) &&
          statement.name &&
          ts.isIdentifier(statement.name)
        )
          return [statement.name];
        return [];
      })
      .map((identifier) => [identifier.text, identifier]),
  );
