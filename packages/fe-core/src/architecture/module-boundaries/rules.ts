import { checkLayerRules } from "./layer-rules.ts";
import { checkModuleRules } from "./module-rules.ts";
import type {
  ImportGraph,
  ModuleBoundariesConfig,
  ModuleBoundaryFinding,
} from "./types.ts";
/**
 * Собирает layer диагностики и правила каждой module group в порядке конфигурации; graph/config не изменяются.
 */
export const checkGraphRules = ({
  config,
  graph,
}: Readonly<{
  config: ModuleBoundariesConfig;
  graph: ImportGraph;
}>): ModuleBoundaryFinding[] => [
  ...checkLayerRules({ layers: config.layers, graph }),
  ...config.moduleGroups.flatMap((group) => checkModuleRules({ group, graph })),
];
