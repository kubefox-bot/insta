import type { ImportGraph, ModuleEdge } from "./types.ts";

type EdgeOptions = Readonly<{
  graph: ImportGraph;
  ownerOf: (path: string) => string | undefined;
}>;
/**
 * Собирает рёбра от одного owned исходника к другому владельцу, проходя промежуточные неowned файлы; хранит маршрут и локально подавляет повторные посещения.
 */
const collectOwnerEdges = ({
  graph,
  ownerOf,
  source,
}: EdgeOptions & Readonly<{ source: string }>): ModuleEdge[] => {
  const edges: ModuleEdge[] = [];
  const sourceOwner = ownerOf(source);
  if (!sourceOwner) return edges;
  const visited = new Set<string>();
  /**
   * Обходит неowned промежуточные зависимости до первого владельца, изменяя локальные visited/edges; при достижении своего владельца маршрут прекращается.
   */
  const visit = (target: string, via: readonly string[]): void => {
    if (visited.has(target)) return;
    visited.add(target);
    const targetOwner = ownerOf(target);
    const route = [...via, target];
    if (!targetOwner) {
      for (const next of graph.get(target) ?? []) visit(next, route);
      return;
    }
    if (targetOwner !== sourceOwner) edges.push({ source, target, via: route });
  };
  for (const target of graph.get(source) ?? []) visit(target, [source]);
  return edges;
};
/**
 * Строит межвладельческие рёбра для всех ключей графа с маршрутами через неowned файлы; входной граф остаётся неизменным.
 */
export const ownerEdges = (options: EdgeOptions): ModuleEdge[] =>
  [...options.graph.keys()].flatMap((source) =>
    collectOwnerEdges({ ...options, source }),
  );
