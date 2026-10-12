import * as ts from "typescript/unstable/ast";
import {
  SymbolFlags,
  type Symbol as TypeScriptSymbol,
} from "typescript/unstable/async";
import { AMBIENT_GLOBAL_NAMES } from "./http-calls/conts.ts";
import {
  definitionForHttpClient,
  hasHttpClientMethod,
  isDefaultHttpClientExport,
} from "./http-clients/classify.ts";
import type { HttpClientBinding, HttpSymbolContext } from "./module.types.ts";
import { memberName } from "./module-parser.ts";
import { isCommonJsRequire, literalModuleSpecifier } from "./rules.ts";

// Resolve the binding at the expression, not its spelling elsewhere in the file.
// Symbol identity preserves block/function scopes, hoisting and import aliases.
/**
 * Распознаёт named import fetch из точного specifier undici с учётом локального alias имени.
 */
const isUndiciFetchImport = (declaration: ts.Node): boolean => {
  if (!ts.isImportSpecifier(declaration)) return false;
  const importedName = declaration.propertyName ?? declaration.name;
  const importDeclaration = declaration.parent.parent.parent;
  return (
    importedName.text === "fetch" &&
    ts.isImportDeclaration(importDeclaration) &&
    literalModuleSpecifier(importDeclaration.moduleSpecifier) === "undici"
  );
};

/**
 * Принимает function/variable/module декларацию только из глобального declaration file либо declare global; implementation declaration не считается ambient fetch.
 */
const isAmbientGlobalFetchDeclaration = (
  declaration: ts.Node | undefined,
): boolean => {
  if (
    !declaration ||
    !(
      ts.isFunctionDeclaration(declaration) ||
      ts.isVariableDeclaration(declaration) ||
      ts.isModuleDeclaration(declaration)
    )
  ) {
    return false;
  }
  const statement = ts.isVariableDeclaration(declaration)
    ? declaration.parent.parent
    : declaration;
  const scope = ambientDeclarationScope(statement);
  if (!scope) return false;
  return (
    ts.isSourceFile(scope) &&
    scope.isDeclarationFile &&
    (!scope.externalModuleIndicator || statement.parent !== scope)
  );
};

/**
 * Раскрывает scope declare global до родителя; обычный module block отклоняет, остальные scopes возвращает для дальнейшей проверки.
 */
const ambientDeclarationScope = (statement: ts.Node): ts.Node | undefined => {
  const scope = statement.parent;
  if (!ts.isModuleBlock(scope)) return scope;
  const declaration = scope.parent;
  if (
    !ts.isModuleDeclaration(declaration) ||
    !(ts.isIdentifier(declaration.name) && declaration.name.text === "global")
  ) {
    return undefined;
  }
  return declaration.parent;
};

/**
 * Требует имя fetch и непустой набор исключительно ambient global деклараций; смешение с локальной реализацией исключает совпадение.
 */
const isAmbientGlobalFetch = (
  symbol: TypeScriptSymbol,
  declarations: readonly (ts.Node | undefined)[],
): boolean =>
  symbol.name === "fetch" &&
  declarations.length > 0 &&
  declarations.every(isAmbientGlobalFetchDeclaration);

/**
 * Распознаёт undici import либо рекурсивно проверяет initializer переменной как fetch expression; другие декларации не трактует как alias.
 */
const declarationResolvesToFetch = async (
  declaration: ts.Node | undefined,
  symbols: HttpSymbolContext,
  visited: ReadonlySet<number>,
): Promise<boolean> => {
  if (!declaration) return false;
  if (isUndiciFetchImport(declaration)) return true;
  if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
    return isFetchExpression(declaration.initializer, symbols, visited);
  }
  return false;
};

/**
 * Прослеживает initializers и alias symbols с защитой visited от циклов, затем проверяет ambient fetch; использует реальную идентичность символов.
 */
const isFetchSymbol = async (
  symbol: TypeScriptSymbol,
  symbols: HttpSymbolContext,
  visited: ReadonlySet<number>,
): Promise<boolean> => {
  if (visited.has(symbol.id)) return false;
  const nextVisited = new Set([...visited, symbol.id]);
  const declarations = await Promise.all(
    symbol.declarations.map((declaration) => declaration.resolve()),
  );

  for (const declaration of declarations) {
    if (await declarationResolvesToFetch(declaration, symbols, nextVisited)) {
      return true;
    }
  }

  if (symbol.flags & SymbolFlags.Alias) {
    return isFetchSymbol(
      await symbols.project.checker.getAliasedSymbol(symbol),
      symbols,
      nextVisited,
    );
  }

  // Ambient global fetch comes from the consumer's libraries. A same-name
  // implementation declaration (even merged with lib.dom) is a local binding.
  return isAmbientGlobalFetch(symbol, declarations);
};

/**
 * Извлекает identifier-основание .fetch или ["fetch"]; сложные receivers и вычисляемые ключи не распознаёт.
 */
const globalFetchReceiver = (
  expression: ts.Expression,
): ts.Identifier | undefined => {
  if (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === "fetch" &&
    ts.isIdentifier(expression.expression)
  ) {
    return expression.expression;
  }
  if (
    ts.isElementAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.argumentExpression &&
    literalModuleSpecifier(expression.argumentExpression) === "fetch"
  ) {
    return expression.expression;
  }
  return undefined;
};

/**
 * Распознаёт global/undici fetch и поддерживаемые aliases с учётом затенения; свободный fetch без typings остаётся запрещаемым, произвольный data flow не доказывается.
 */
export const isFetchExpression = async (
  expression: ts.Expression,
  symbols: HttpSymbolContext,
  visited: ReadonlySet<number> = new Set(),
): Promise<boolean> => {
  if (ts.isParenthesizedExpression(expression)) {
    return isFetchExpression(expression.expression, symbols, visited);
  }
  const globalReceiver = globalFetchReceiver(expression);
  if (globalReceiver) {
    if (!AMBIENT_GLOBAL_NAMES.includes(globalReceiver.text)) {
      return false;
    }
    const globalSymbol = await symbols.symbolAtLocation(globalReceiver);
    if (!globalSymbol || globalSymbol.declarations.length === 0) return true;
    const declarations = await Promise.all(
      globalSymbol.declarations.map((declaration) => declaration.resolve()),
    );
    return declarations.every((declaration) => {
      const sourceFile = declaration?.getSourceFile();
      return Boolean(
        sourceFile?.isDeclarationFile && !sourceFile.externalModuleIndicator,
      );
    });
  }
  if (!ts.isIdentifier(expression)) return false;
  const symbol = await symbols.symbolAtLocation(expression);
  // Missing runtime typings must not turn a free global fetch into an exemption.
  if (!symbol) return expression.text === "fetch";
  return isFetchSymbol(symbol, symbols, visited);
};

/**
 * Предпочитает lookup по symbol.id; fallback по имени разрешён только при отсутствии символа, чтобы не спутать локальное затенение с импортом.
 */
const bindingForIdentifier = async (
  identifier: ts.Identifier,
  bindingSymbols: ReadonlyMap<number, HttpClientBinding>,
  bindingNames: ReadonlyMap<string, HttpClientBinding>,
  symbols: HttpSymbolContext,
): Promise<HttpClientBinding | undefined> => {
  const symbol = await symbols.symbolAtLocation(identifier);
  return symbol
    ? bindingSymbols.get(symbol.id)
    : bindingNames.get(identifier.text);
};

/**
 * Извлекает литеральный первый аргумент синтаксического require; остальные expressions и вычисляемые аргументы дают undefined.
 */
const commonJsSpecifier = (expression: ts.Expression): string | undefined => {
  if (!isCommonJsRequire(expression)) return undefined;
  const [argument] = expression.arguments;
  return argument ? literalModuleSpecifier(argument) : undefined;
};

/**
 * Распознаёт непосредственный require(package) либо его литеральный request-member по HTTP-каталогу; неизвестные пакеты пропускаются.
 */
const inlineHttpClientCall = (expression: ts.Expression): boolean => {
  if (isCommonJsRequire(expression)) {
    const specifier = commonJsSpecifier(expression);
    return Boolean(
      specifier && definitionForHttpClient(specifier)?.directCallable,
    );
  }
  if (
    !ts.isPropertyAccessExpression(expression) &&
    !ts.isElementAccessExpression(expression)
  ) {
    return false;
  }
  const specifier = commonJsSpecifier(expression.expression);
  const definition = specifier ? definitionForHttpClient(specifier) : undefined;
  const property = memberName(expression);
  return Boolean(
    definition &&
      property &&
      (isDefaultHttpClientExport(definition, property) ||
        hasHttpClientMethod(definition, property)),
  );
};

/**
 * Проверяет inline CommonJS, callable identifier binding и известный member на identifier receiver; сложные expressions и неизвестные методы не классифицирует.
 */
export const isKnownHttpClientCall = async (
  node: ts.CallExpression,
  bindingSymbols: ReadonlyMap<number, HttpClientBinding>,
  bindingNames: ReadonlyMap<string, HttpClientBinding>,
  symbols: HttpSymbolContext,
): Promise<boolean> => {
  const expression = node.expression;
  if (inlineHttpClientCall(expression)) return true;
  if (ts.isIdentifier(expression)) {
    return Boolean(
      (
        await bindingForIdentifier(
          expression,
          bindingSymbols,
          bindingNames,
          symbols,
        )
      )?.directCallable,
    );
  }
  if (
    (!ts.isPropertyAccessExpression(expression) &&
      !ts.isElementAccessExpression(expression)) ||
    !ts.isIdentifier(expression.expression)
  ) {
    return false;
  }
  const binding = await bindingForIdentifier(
    expression.expression,
    bindingSymbols,
    bindingNames,
    symbols,
  );
  const property = memberName(expression);
  return Boolean(binding && property && binding.methods.has(property));
};
