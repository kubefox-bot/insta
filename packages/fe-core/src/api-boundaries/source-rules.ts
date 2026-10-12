import * as ts from "typescript/unstable/ast";
import type { Project } from "typescript/unstable/async";
import type { SymbolAtLocation } from "../lib/source-analysis/index.ts";
import { addFinding } from "./findings.ts";
import { isFetchExpression, isKnownHttpClientCall } from "./http-calls.ts";
import type { HttpClientBinding, ParsedModule } from "./module.types.ts";
import { finding, isAnyType, isDoubleAssertion, walk } from "./rules.ts";
import { isInside, isInsideAny, normalizePath } from "./source-paths.ts";
import type { ApiBoundaryConfig, ApiBoundaryFinding } from "./types.ts";

/**
 * Сканирует именно comment trivia на директивы ts-ignore/ts-nocheck, не принимая строковые литералы за suppression; ts-expect-error не входит в это правило.
 */
const hasTypeScriptSuppression = (sourceFile: ts.SourceFile): boolean => {
  const scanner = ts.createScanner(
    false,
    ts.LanguageVariant.Standard,
    sourceFile.text,
  );
  for (
    let token = scanner.scan();
    token !== ts.SyntaxKind.EndOfFile;
    token = scanner.scan()
  ) {
    if (
      (token === ts.SyntaxKind.SingleLineCommentTrivia ||
        token === ts.SyntaxKind.MultiLineCommentTrivia) &&
      /@ts-(?:ignore|nocheck)\b/u.test(scanner.getTokenText())
    ) {
      return true;
    }
  }
  return false;
};

type SourceRuleContext = {
  config: ApiBoundaryConfig;
  findings: ApiBoundaryFinding[];
  httpClientBindingNames: ReadonlyMap<string, HttpClientBinding>;
  httpClientBindingSymbols: ReadonlyMap<number, HttpClientBinding>;
  isGenerated: boolean;
  isManualApi: boolean;
  isTransport: boolean;
  module: ParsedModule;
  path: string;
  project: Project;
  symbolAtLocation: SymbolAtLocation;
};

/**
 * Разрешает HTTP bindings в карту symbol.id, пропуская отсутствующие символы; сохраняет идентичность binding для проверки затенения.
 */
const collectHttpClientBindingSymbols = async (
  bindings: readonly HttpClientBinding[],
  symbolAtLocation: SymbolAtLocation,
): Promise<ReadonlyMap<number, HttpClientBinding>> => {
  const symbols = new Map<number, HttpClientBinding>();
  for (const binding of bindings) {
    const symbol = await symbolAtLocation(binding.identifier);
    if (symbol) symbols.set(symbol.id, binding);
  }
  return symbols;
};

/**
 * Добавляет диагностики direct HTTP вне transports и any/double assertion в ручном API; меняет только findings и учитывает scoped exceptions.
 */
const checkSourceNode = async (
  node: ts.Node,
  context: SourceRuleContext,
): Promise<void> => {
  const { config, findings, path } = context;
  if (
    !context.isTransport &&
    ts.isCallExpression(node) &&
    ((await isFetchExpression(node.expression, context)) ||
      (await isKnownHttpClientCall(
        node,
        context.httpClientBindingSymbols,
        context.httpClientBindingNames,
        context,
      )))
  ) {
    addFinding(
      findings,
      config,
      finding(
        "direct-fetch",
        path,
        "fetch и HTTP-клиенты разрешены только в явно настроенном transport file.",
        "src/api/server/transport.ts",
      ),
    );
  }
  if (context.isManualApi && isAnyType(node)) {
    addFinding(
      findings,
      config,
      finding(
        "manual-api-type",
        path,
        "Рукописный API-слой не должен использовать any.",
        "unknown с явной проверкой формы ответа",
      ),
    );
  }
  if (context.isManualApi && isDoubleAssertion(node)) {
    addFinding(
      findings,
      config,
      finding(
        "manual-api-type",
        path,
        "Рукописный API-слой не должен использовать двойное type assertion.",
        "валидируй unknown до приведения к целевому типу",
      ),
    );
  }
};

/**
 * Добавляет отдельную диагностику на каждый подсчитанный вычисляемый import/require с учётом scoped exceptions.
 */
const addDynamicImportFindings = (context: SourceRuleContext): void => {
  for (let index = 0; index < context.module.dynamicImports; index += 1) {
    addFinding(
      context.findings,
      context.config,
      finding(
        "dynamic-import",
        context.path,
        "Динамически вычисляемый import или require нельзя проверить на API-границы.",
        'import("@/api/server/transport")',
      ),
    );
  }
};

/**
 * Проверяет один script AST с заданными config/symbol scopes: raw HTTP, ручные API типы/suppressions и вычисляемые импорты; findings пополняется, project остаётся заимствованным.
 */
export const checkSourceRules = async ({
  module,
  config,
  findings,
  path,
  project,
  scopeBindings = module.httpClientBindings,
  symbolAtLocation = (identifier) =>
    project.checker.getSymbolAtLocation(identifier),
}: {
  module: ParsedModule;
  config: ApiBoundaryConfig;
  findings: ApiBoundaryFinding[];
  path: string;
  project: Project;
  scopeBindings?: readonly HttpClientBinding[];
  symbolAtLocation?: SymbolAtLocation;
}): Promise<void> => {
  const isGenerated = isInside(path, normalizePath(config.generatedRoot));
  const context: SourceRuleContext = {
    config,
    findings,
    httpClientBindingNames: new Map(
      module.httpClientBindings.map((binding) => [
        binding.identifier.text,
        binding,
      ]),
    ),
    httpClientBindingSymbols: await collectHttpClientBindingSymbols(
      scopeBindings,
      symbolAtLocation,
    ),
    isGenerated,
    isManualApi:
      (isInsideAny(path, config.serverApiRoots.map(normalizePath)) ||
        (config.serverApiFiles ?? []).map(normalizePath).includes(path)) &&
      !isGenerated,
    isTransport: [
      ...config.transportFiles,
      ...(config.browserTransportFiles ?? []),
    ]
      .map(normalizePath)
      .includes(path),
    module,
    path,
    project,
    symbolAtLocation,
  };
  const nodes: ts.Node[] = [];
  walk(module.sourceFile, (node) => nodes.push(node));
  for (const node of nodes) {
    await checkSourceNode(node, context);
  }

  if (context.isManualApi && hasTypeScriptSuppression(module.sourceFile)) {
    addFinding(
      findings,
      config,
      finding(
        "manual-api-type",
        path,
        "Рукописный API-слой не должен отключать TypeScript через @ts-ignore или @ts-nocheck.",
        "исправь тип или добавь проверку unknown",
      ),
    );
  }

  addDynamicImportFindings(context);
};
