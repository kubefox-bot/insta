import * as ts from "typescript/unstable/ast";
import type { Project } from "typescript/unstable/async";
import type { SymbolAtLocation } from "../lib/source-analysis/index.ts";
import type { ArchitectureFinding } from "./types.ts";

/**
 * Извлекает основание доступа .env или ["env"]; вычисляемые ключи и другие свойства не распознаёт.
 */
const envMember = (node: ts.Node): ts.Expression | undefined => {
  if (ts.isPropertyAccessExpression(node) && node.name.text === "env")
    return node.expression;
  if (
    ts.isElementAccessExpression(node) &&
    node.argumentExpression &&
    ts.isStringLiteralLikeNode(node.argumentExpression) &&
    node.argumentExpression.text === "env"
  ) {
    return node.expression;
  }
  return undefined;
};

/**
 * Проверяет наличие разрешённой декларации в недекларационном исходнике, чтобы отличить локальный binding от ambient process/Bun.
 */
const localDeclaration = async (
  identifier: ts.Identifier,
  symbolAtLocation: SymbolAtLocation,
): Promise<boolean> => {
  const symbol = await symbolAtLocation(identifier);
  if (!symbol) return false;
  const declarations = await Promise.all(
    symbol.declarations.map((declaration) => declaration.resolve()),
  );
  return declarations.some((declaration) => {
    if (!declaration) return false;
    let ancestor: ts.Node | undefined = declaration;
    while (ancestor && !ts.isSourceFile(ancestor)) ancestor = ancestor.parent;
    return ancestor && ts.isSourceFile(ancestor) && !ancestor.isDeclarationFile;
  });
};

type ProcessImportKind = "environment" | "module";

/**
 * Поднимается по родителям AST до ближайшего import declaration; при его отсутствии возвращает undefined.
 */
const enclosingImport = (node: ts.Node): ts.ImportDeclaration | undefined => {
  let ancestor: ts.Node | undefined = node;
  while (ancestor && !ts.isImportDeclaration(ancestor))
    ancestor = ancestor.parent;
  return ancestor;
};

/**
 * Сохраняет узел import binding либо берёт родителя идентификатора для последующей классификации формы импорта.
 */
const importBinding = (declaration: ts.Node): ts.Node =>
  ts.isImportSpecifier(declaration) ||
  ts.isImportClause(declaration) ||
  ts.isNamespaceImport(declaration)
    ? declaration
    : declaration.parent;

/**
 * Распознаёт импорт env и namespace/default process из process/node:process; остальные декларации не классифицирует.
 */
const processImportDeclaration = (
  declaration: ts.Node | undefined,
): ProcessImportKind | undefined => {
  if (!declaration) return undefined;
  const binding = importBinding(declaration);
  const ancestor = enclosingImport(declaration);
  if (
    !ancestor ||
    !ts.isStringLiteralLikeNode(ancestor.moduleSpecifier) ||
    !["process", "node:process"].includes(ancestor.moduleSpecifier.text)
  )
    return undefined;
  if (ts.isImportSpecifier(binding))
    return (binding.propertyName ?? binding.name).text === "env"
      ? "environment"
      : undefined;
  if (ts.isImportClause(binding) || ts.isNamespaceImport(binding))
    return "module";
  return undefined;
};

/**
 * Разрешает символ с учётом переданного scope resolver и возвращает первую декларацию импорта process/env; отсутствие совпадения не считается ошибкой.
 */
const processImportKind = async (
  identifier: ts.Identifier,
  symbolAtLocation: SymbolAtLocation,
): Promise<ProcessImportKind | undefined> => {
  const symbol = await symbolAtLocation(identifier);
  if (!symbol) return undefined;
  const declarations = await Promise.all(
    symbol.declarations.map((declaration) => declaration.resolve()),
  );
  return declarations
    .map(processImportDeclaration)
    .find((kind) => kind !== undefined);
};

/**
 * Распознаёт module-import process, незатенённые process/Bun и MetaProperty как основания env-доступа; произвольный data flow не анализирует.
 */
const isRawEnvironment = async (
  expression: ts.Expression,
  symbolAtLocation: SymbolAtLocation,
): Promise<boolean> => {
  if (ts.isIdentifier(expression)) {
    if ((await processImportKind(expression, symbolAtLocation)) === "module")
      return true;
    return (
      (expression.text === "process" || expression.text === "Bun") &&
      !(await localDeclaration(expression, symbolAtLocation))
    );
  }
  return expression.kind === ts.SyntaxKind.MetaProperty;
};

/**
 * Вне точных config owners ищет прямой env-доступ, деструктуризацию и ссылки на импортированный env; возвращает не более одной диагностики, учитывая локальное затенение через resolver.
 */
export const checkEnvironmentAccess = async ({
  path,
  sourceFile,
  project,
  owners,
  symbolAtLocation = (identifier) =>
    project.checker.getSymbolAtLocation(identifier),
}: Readonly<{
  path: string;
  sourceFile: ts.SourceFile | undefined;
  project: Project;
  owners: ReadonlySet<string>;
  symbolAtLocation?: SymbolAtLocation;
}>): Promise<ArchitectureFinding[]> => {
  if (!sourceFile || owners.has(path)) return [];
  const candidates: ts.Expression[] = [];
  /**
   * Собирает основания явных env-доступов и деструктуризации в локальный список, рекурсивно обходя AST без изменения узлов.
   */
  const visit = (node: ts.Node): void => {
    const member = envMember(node);
    if (member) candidates.push(member);
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.name.elements.some(
        (element) =>
          (element.propertyName ?? element.name)?.getText(sourceFile) === "env",
      ) &&
      node.initializer
    )
      candidates.push(node.initializer);
    node.forEachChild(visit);
  };
  visit(sourceFile);
  const importedEnvironmentReferences: ts.Identifier[] = [];
  /**
   * Собирает идентификаторы вне import bindings для проверки использования импортированного env; символы разрешаются последующим проходом.
   */
  const visitIdentifiers = (node: ts.Node): void => {
    if (
      ts.isIdentifier(node) &&
      !ts.isImportDeclaration(node.parent) &&
      !ts.isImportClause(node.parent) &&
      !ts.isImportSpecifier(node.parent) &&
      !ts.isNamespaceImport(node.parent)
    )
      importedEnvironmentReferences.push(node);
    node.forEachChild(visitIdentifiers);
  };
  visitIdentifiers(sourceFile);
  for (const identifier of importedEnvironmentReferences) {
    if (
      (await processImportKind(identifier, symbolAtLocation)) === "environment"
    ) {
      return [
        {
          rule: "environment-access",
          path,
          message: "Сырые env-значения читает только назначенный config owner.",
          example: "Передай проверенную конфигурацию из owning module.",
        },
      ];
    }
  }
  for (const candidate of candidates) {
    if (await isRawEnvironment(candidate, symbolAtLocation)) {
      return [
        {
          rule: "environment-access",
          path,
          message: "Сырые env-значения читает только назначенный config owner.",
          example: "Передай проверенную конфигурацию из owning module.",
        },
      ];
    }
  }
  return [];
};
