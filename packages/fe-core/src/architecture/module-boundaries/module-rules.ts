import { findModuleCycles } from "./cycles.ts";
import { ownerEdges } from "./edges.ts";
import { moduleOwner } from "./paths.ts";
import type {
  ImportGraph,
  ModuleBoundariesConfig,
  ModuleBoundaryFinding,
} from "./types.ts";

/**
 * Проверяет прямые входящие импорты в чужой модуль группы: target обязан совпасть с publicEntrypoints относительно владельца.
 */
const checkPublicImports = ({
  group,
  graph,
}: Readonly<{
  group: ModuleBoundariesConfig["moduleGroups"][number];
  graph: ImportGraph;
}>): ModuleBoundaryFinding[] => {
  const findings: ModuleBoundaryFinding[] = [];
  /**
   * Определяет модуль как первый дочерний каталог group.root; файлы вне модуля остаются без владельца.
   */
  const ownerOf = (path: string) => moduleOwner(path, group.root);
  for (const [source, targets] of graph) {
    for (const target of targets) {
      const targetOwner = ownerOf(target);
      if (!targetOwner || ownerOf(source) === targetOwner) continue;
      const relative = target.slice(targetOwner.length + 1);
      if (!group.publicEntrypoints.includes(relative))
        findings.push({
          rule: "private-module-import",
          path: source,
          message: `${target} — приватная реализация ${targetOwner}; разрешены ${group.publicEntrypoints.join(", ")}`,
        });
    }
  }
  return findings;
};
/**
 * Объединяет нарушения public entrypoints с циклами между модулями, если forbidCycles включён; входной граф не изменяет.
 */
export const checkModuleRules = ({
  group,
  graph,
}: Readonly<{
  group: ModuleBoundariesConfig["moduleGroups"][number];
  graph: ImportGraph;
}>): ModuleBoundaryFinding[] => {
  const findings = checkPublicImports({ group, graph });
  if (!group.forbidCycles) return findings;
  /**
   * Определяет модуль как первый дочерний каталог group.root; файлы вне модуля остаются без владельца.
   */
  const ownerOf = (path: string) => moduleOwner(path, group.root);
  return [
    ...findings,
    ...findModuleCycles({ edges: ownerEdges({ graph, ownerOf }), ownerOf }),
  ];
};
