import * as ts from "typescript/unstable/ast";
import type {
  Project,
  Symbol as SourceSymbol,
} from "typescript/unstable/async";
import { moduleBindings } from "./bindings.ts";
import type { SymbolAtLocation } from "./types.ts";

/**
 * Разрешает декларации символа и проверяет принадлежность заданному виртуальному файлу; отсутствие символа означает false.
 */
const belongsToScope = async (
  symbol: SourceSymbol | undefined,
  filename: string,
): Promise<boolean> => {
  if (!symbol) return false;
  const declarations = await Promise.all(
    symbol.declarations.map((declaration) => declaration.resolve()),
  );
  return declarations.some(
    (declaration) => declaration?.getSourceFile().fileName === filename,
  );
};

/**
 * Resolve the actual parent symbol, preserving native local binding identity.
 * Для instance script использует module binding только при отсутствии локальной декларации;
 * property names остаются у native checker. Кэш parent bindings живёт вместе с resolver.
 */
export const createSymbolResolver = ({
  project,
  parentScopes,
}: Readonly<{
  project: Project;
  parentScopes: ReadonlyMap<string, string>;
}>): SymbolAtLocation => {
  const parents = new Map<
    string,
    Promise<ReadonlyMap<string, ts.Identifier>>
  >();
  /**
   * Кэширует Promise runtime bindings родительского Svelte script; отсутствующий ожидаемый AST отклоняет Promise и не превращается в пустую карту.
   */
  const parentBindings = (filename: string) => {
    const existing = parents.get(filename);
    if (existing) return existing;
    const bindings = project.program.getSourceFile(filename).then((source) => {
      if (!source)
        throw new Error(`Нет родительского Svelte scope: ${filename}`);
      return moduleBindings(source);
    });
    parents.set(filename, bindings);
    return bindings;
  };
  return async (identifier) => {
    const symbol = await project.checker.getSymbolAtLocation(identifier);
    if (
      ts.isPropertyAccessExpression(identifier.parent) &&
      identifier.parent.name === identifier
    )
      return symbol;
    const filename = identifier.getSourceFile().fileName;
    const parent = parentScopes.get(filename);
    if (!parent || (await belongsToScope(symbol, filename))) return symbol;
    const inherited = (await parentBindings(parent)).get(identifier.text);
    return inherited ? project.checker.getSymbolAtLocation(inherited) : symbol;
  };
};

/**
 * Связывает instance .default.ts с module .module.ts только для компонентов, имеющих оба виртуальных скрипта.
 */
export const parentScriptScopes = (
  scripts: Iterable<ReadonlyMap<string, string>>,
): ReadonlyMap<string, string> =>
  new Map(
    [...scripts].flatMap((script) => {
      const module = [...script.keys()].find((path) =>
        path.endsWith(".module.ts"),
      );
      const instance = [...script.keys()].find((path) =>
        path.endsWith(".default.ts"),
      );
      return module && instance ? [[instance, module]] : [];
    }),
  );
