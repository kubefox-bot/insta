import { parseForbiddenDependencies } from "./config/dependencies.ts";
import { parseGroups } from "./config/groups.ts";
import { parseLayers } from "./config/layers.ts";
import { exactKeys, path, record } from "./config/values.ts";
import type { ModuleBoundariesConfig } from "./types.ts";
/**
 * Проверяет закрытый набор полей внешней конфигурации, точный sourceRoot и контракты layers/groups/dependencies; неверный ввод бросает TypeError.
 */
export const parseModuleBoundariesConfig = (
  value: unknown,
): ModuleBoundariesConfig => {
  const config = record(value, "config");
  exactKeys(
    config,
    ["sourceRoot", "layers", "moduleGroups", "forbiddenDependencies"],
    "config",
  );
  const sourceRoot = path(config.sourceRoot, "sourceRoot");
  return {
    sourceRoot,
    forbiddenDependencies: parseForbiddenDependencies(
      config.forbiddenDependencies,
    ),
    layers: parseLayers({ value: config.layers, sourceRoot }),
    moduleGroups: parseGroups({ value: config.moduleGroups, sourceRoot }),
  };
};
