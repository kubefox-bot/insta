import * as ts from "typescript/unstable/ast";
import {
  definitionForHttpClient,
  isDefaultHttpClientExport,
  isHttpClientRequestExport,
} from "./http-clients/classify.ts";
import type {
  HttpClientBinding,
  ModuleReference,
  ParsedModule,
} from "./module.types.ts";
import {
  isCommonJsRequire,
  isDynamicImport,
  literalModuleSpecifier,
  walk,
} from "./rules.ts";

/**
 * Ищет directive только в начальной последовательности строковых expression statements; первая другая statement завершает поиск.
 */
const hasDirective = (
  sourceFile: ts.SourceFile,
  directive: string,
): boolean => {
  for (const statement of sourceFile.statements) {
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isStringLiteralLikeNode(statement.expression)
    ) {
      return false;
    }
    if (statement.expression.text === directive) {
      return true;
    }
  }
  return false;
};

/**
 * Читает имя dot member или литеральный computed member; динамический ключ остаётся undefined.
 */
export const memberName = (
  node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): string | undefined => {
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text;
  }

  return node.argumentExpression
    ? literalModuleSpecifier(node.argumentExpression)
    : undefined;
};

/**
 * Находит переменную, только когда выражение является её непосредственным initializer; скобки и другие обёртки не раскрываются.
 */
const directVariable = (
  node: ts.Expression,
): ts.VariableDeclaration | undefined =>
  ts.isVariableDeclaration(node.parent) && node.parent.initializer === node
    ? node.parent
    : undefined;

/**
 * Извлекает исходное имя простого destructuring binding с возможным rename; rest, вложенный binding и вычисляемый ключ пропускаются.
 */
const bindingExportName = (element: ts.BindingElement): string | undefined => {
  const name = element.name;
  if (element.dotDotDotToken || !name || !ts.isIdentifier(name)) {
    return undefined;
  }
  const exported = element.propertyName ?? name;
  return ts.isIdentifier(exported) || ts.isStringLiteralLikeNode(exported)
    ? exported.text
    : undefined;
};

type ModuleParserContext = {
  imports: ModuleReference[];
  httpClientBindings: HttpClientBinding[];
  dynamicImports: number;
  sourceFile: ts.SourceFile;
  resolveSpecifier: (specifier: string) => string | undefined;
};

/**
 * Добавляет в локальный parser context specifier и результат переданного resolver; неразрешённый target сохраняется как undefined.
 */
const addImport = (context: ModuleParserContext, specifier: string): void => {
  context.imports.push({
    specifier,
    target: context.resolveSpecifier(specifier),
  });
};

/**
 * Добавляет binding только для известного HTTP-клиента и существующего идентификатора; описание методов берётся из каталога.
 */
const addHttpClientBinding = (
  context: ModuleParserContext,
  specifier: string,
  binding: ts.Identifier | undefined,
  definition = definitionForHttpClient(specifier),
): void => {
  if (binding && definition) {
    context.httpClientBindings.push({ ...definition, identifier: binding });
  }
};

/**
 * Регистрирует только request-export клиента; отдельный метод становится directCallable binding без методов, callable default сохраняет полное описание.
 */
const addHttpClientMethodBinding = (
  context: ModuleParserContext,
  specifier: string,
  exportedName: string,
  binding: ts.Identifier | undefined,
): void => {
  const definition = definitionForHttpClient(specifier);
  if (
    !binding ||
    !definition ||
    !isHttpClientRequestExport(definition, exportedName)
  ) {
    return;
  }
  addHttpClientBinding(
    context,
    specifier,
    binding,
    isDefaultHttpClientExport(definition, exportedName)
      ? definition
      : { directCallable: true, methods: new Set() },
  );
};

/**
 * Регистрирует default/namespace/named HTTP bindings из import clause; namespace не считается напрямую callable, отдельная фильтрация type-only здесь отсутствует.
 */
const addImportClauseBindings = (
  context: ModuleParserContext,
  specifier: string,
  clause: ts.ImportClause | undefined,
): void => {
  const definition = definitionForHttpClient(specifier);
  if (!clause || !definition) return;
  addHttpClientBinding(context, specifier, clause.name);
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) {
    addHttpClientBinding(context, specifier, bindings.name, {
      ...definition,
      directCallable: false,
    });
  }
  if (bindings && ts.isNamedImports(bindings)) {
    for (const element of bindings.elements) {
      const exported = element.propertyName ?? element.name;
      addHttpClientMethodBinding(
        context,
        specifier,
        exported.text,
        element.name,
      );
    }
  }
};

/**
 * Регистрирует непосредственное присваивание require переменной или простой object destructuring; другие формы data flow не отслеживает.
 */
const addCommonJsDeclarationBindings = (
  context: ModuleParserContext,
  specifier: string,
  requireCall: ts.CallExpression,
): void => {
  const declaration = directVariable(requireCall);
  if (!declaration) return;
  if (ts.isIdentifier(declaration.name)) {
    addHttpClientBinding(context, specifier, declaration.name);
    return;
  }
  if (!ts.isObjectBindingPattern(declaration.name)) return;
  for (const element of declaration.name.elements) {
    const exportedName = bindingExportName(element);
    const name = element.name;
    if (exportedName && name && ts.isIdentifier(name)) {
      addHttpClientMethodBinding(context, specifier, exportedName, name);
    }
  }
};

/**
 * Регистрирует непосредственную переменную из require(...).method или литерального member; обёртки/вычисляемые свойства пропускаются.
 */
const addCommonJsMemberBinding = (
  context: ModuleParserContext,
  specifier: string,
  requireCall: ts.CallExpression,
): void => {
  const parent = requireCall.parent;
  if (
    !ts.isPropertyAccessExpression(parent) &&
    !ts.isElementAccessExpression(parent)
  ) {
    return;
  }

  const property = memberName(parent);
  const memberDeclaration = directVariable(parent);
  if (
    property &&
    memberDeclaration &&
    ts.isIdentifier(memberDeclaration.name)
  ) {
    addHttpClientMethodBinding(
      context,
      specifier,
      property,
      memberDeclaration.name,
    );
  }
};

/**
 * Последовательно собирает whole-module/destructuring и member bindings для одного require; изменяет только parser context.
 */
const addCommonJsBindings = (
  context: ModuleParserContext,
  specifier: string,
  requireCall: ts.CallExpression,
): void => {
  addCommonJsDeclarationBindings(context, specifier, requireCall);
  addCommonJsMemberBinding(context, specifier, requireCall);
};

/**
 * Добавляет литеральный import/export from в граф и для import собирает HTTP bindings; отсутствие specifier пропускается.
 */
const parseImportStatement = (
  context: ModuleParserContext,
  statement: ts.ImportDeclaration | ts.ExportDeclaration,
): void => {
  const moduleSpecifier = statement.moduleSpecifier;
  if (!moduleSpecifier) return;
  const specifier = literalModuleSpecifier(moduleSpecifier);
  if (!specifier) return;
  addImport(context, specifier);
  if (ts.isImportDeclaration(statement)) {
    addImportClauseBindings(context, specifier, statement.importClause);
  }
};

/**
 * Читает external import equals, регистрируя target и HTTP binding; нелитеральное выражение увеличивает счётчик dynamicImports.
 */
const parseImportEquals = (
  context: ModuleParserContext,
  statement: ts.ImportEqualsDeclaration,
): void => {
  if (
    !ts.isExternalModuleReference(statement.moduleReference) ||
    !statement.moduleReference.expression
  ) {
    return;
  }
  const specifier = literalModuleSpecifier(
    statement.moduleReference.expression,
  );
  if (!specifier) {
    context.dynamicImports += 1;
    return;
  }
  addImport(context, specifier);
  addHttpClientBinding(context, specifier, statement.name);
};

/**
 * Разбирает import()/require(): нелитеральный или отсутствующий аргумент увеличивает dynamicImports, литеральный сохраняет reference и CommonJS bindings.
 */
const parseDynamicNode = (
  context: ModuleParserContext,
  node: ts.CallExpression,
): void => {
  const [argument] = node.arguments;
  const specifier = argument ? literalModuleSpecifier(argument) : undefined;
  if (!specifier) {
    context.dynamicImports += 1;
    return;
  }
  addImport(context, specifier);
  if (isCommonJsRequire(node)) {
    addCommonJsBindings(context, specifier, node);
  }
};

/**
 * Собирает статические import/export, import equals и вложенные import()/require(), HTTP bindings и начальные directives; не выполняет произвольный data flow и resolution делегирует вызывающему.
 */
export const parseModule = (
  sourceFile: ts.SourceFile,
  resolveSpecifier: (specifier: string) => string | undefined,
): ParsedModule => {
  const context: ModuleParserContext = {
    dynamicImports: 0,
    httpClientBindings: [],
    imports: [],
    resolveSpecifier,
    sourceFile,
  };
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) ||
      ts.isExportDeclaration(statement)
    ) {
      parseImportStatement(context, statement);
    }
    if (ts.isImportEqualsDeclaration(statement)) {
      parseImportEquals(context, statement);
    }
  }

  walk(sourceFile, (node) => {
    if (isDynamicImport(node) || isCommonJsRequire(node)) {
      parseDynamicNode(context, node);
    }
  });

  return {
    dynamicImports: context.dynamicImports,
    httpClientBindings: context.httpClientBindings,
    imports: context.imports,
    sourceFile,
    usesClientDirective: hasDirective(sourceFile, "use client"),
    usesServerDirective: hasDirective(sourceFile, "use server"),
  };
};
