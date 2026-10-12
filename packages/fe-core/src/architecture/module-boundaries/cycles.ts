import type { ModuleBoundaryFinding, ModuleEdge } from "./types.ts";

type CycleWalk = Readonly<{
  graph: ReadonlyMap<string, readonly ModuleEdge[]>;
  ownerOf: (path: string) => string | undefined;
  done: Set<string>;
  active: string[];
  findings: ModuleBoundaryFinding[];
}>;
/**
 * Выполняет DFS owner-графа, изменяя принадлежащие проходу active/done/findings; ребро в активный стек добавляет цикл с исходным маршрутом.
 */
const visitOwner = (owner: string, state: CycleWalk): void => {
  if (state.done.has(owner)) return;
  state.active.push(owner);
  for (const edge of state.graph.get(owner) ?? []) {
    const target = state.ownerOf(edge.target);
    if (!target) continue;
    const index = state.active.indexOf(target);
    if (index >= 0)
      state.findings.push({
        rule: "module-cycle",
        path: edge.source,
        message: `${[...state.active.slice(index), target].join(" → ")} (${edge.via.join(" → ")})`,
      });
    else visitOwner(target, state);
  }
  state.active.pop();
  state.done.add(owner);
};
/**
 * Группирует межмодульные рёбра по владельцу и ищет обратные рёбра DFS в стабильном порядке владельцев; неизвестные владельцы пропускаются, входные рёбра не меняются.
 */
export const findModuleCycles = ({
  edges,
  ownerOf,
}: Readonly<{
  edges: readonly ModuleEdge[];
  ownerOf: (path: string) => string | undefined;
}>): ModuleBoundaryFinding[] => {
  const graph = new Map<string, ModuleEdge[]>();
  for (const edge of edges) {
    const source = ownerOf(edge.source);
    if (!source) continue;
    const owned = graph.get(source) ?? [];
    owned.push(edge);
    graph.set(source, owned);
  }
  const findings: ModuleBoundaryFinding[] = [];
  const state: CycleWalk = {
    graph,
    ownerOf,
    findings,
    done: new Set<string>(),
    active: [],
  };
  for (const owner of [...graph.keys()].sort()) visitOwner(owner, state);
  return findings;
};
