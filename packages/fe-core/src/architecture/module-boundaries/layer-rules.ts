import { ownerEdges } from "./edges.ts";
import { isInside } from "./paths.ts";
import type {
  ImportGraph,
  ModuleBoundariesConfig,
  ModuleBoundaryFinding,
} from "./types.ts";
/**
 * Диагностирует межслойные рёбра, не разрешённые allow исходного слоя, включая маршрут через неowned файлы.
 */
export const checkLayerRules = ({
  layers,
  graph,
}: Readonly<{
  layers: ModuleBoundariesConfig["layers"];
  graph: ImportGraph;
}>): ModuleBoundaryFinding[] => {
  /**
   * Выбирает первый слой, содержащий путь по границе каталога; непокрытые пути остаются без владельца.
   */
  const layerOf = (path: string) =>
    layers.find((layer) => isInside(path, layer.root));
  return ownerEdges({
    graph,
    /**
     * Предоставляет имя найденного слоя алгоритму ownerEdges; непокрытый путь остаётся промежуточным неowned узлом.
     */
    ownerOf: (path) => layerOf(path)?.name,
  }).flatMap((edge) => {
    const source = layerOf(edge.source);
    const target = layerOf(edge.target);
    if (!source || !target || source.allow.includes(target.name)) return [];
    return [
      {
        rule: "layer-dependency",
        path: edge.source,
        message: `${source.name} → ${target.name} запрещено: ${edge.via.join(" → ")}`,
      },
    ];
  });
};
