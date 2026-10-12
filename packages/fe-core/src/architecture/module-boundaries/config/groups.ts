import { isInside } from "../paths.ts";
import type { ModuleBoundariesConfig } from "../types.ts";
import { array, assertDisjoint, exactKeys, path, record } from "./values.ts";
/**
 * Проверяет группы внутри sourceRoot с boolean forbidCycles, непустыми точными entrypoints и непересекающимися корнями; файловую систему не читает.
 */
export const parseGroups = ({
  value,
  sourceRoot,
}: Readonly<{
  value: unknown;
  sourceRoot: string;
}>): ModuleBoundariesConfig["moduleGroups"] => {
  const groups = array(value, "moduleGroups").map((value) => {
    const group = record(value, "moduleGroup");
    exactKeys(
      group,
      ["root", "publicEntrypoints", "forbidCycles"],
      "moduleGroup",
    );
    const root = path(group.root, "moduleGroup.root");
    if (!isInside(root, sourceRoot))
      throw new TypeError(
        "moduleGroup.root: ожидается каталог внутри sourceRoot",
      );
    if (typeof group.forbidCycles !== "boolean")
      throw new TypeError("moduleGroup.forbidCycles: ожидается boolean");
    const publicEntrypoints = array(
      group.publicEntrypoints,
      "publicEntrypoints",
    ).map((value) => path(value, "publicEntrypoint"));
    if (!publicEntrypoints.length)
      throw new TypeError("publicEntrypoints: нужен хотя бы один путь");
    return { root, publicEntrypoints, forbidCycles: group.forbidCycles };
  });
  assertDisjoint(groups, "moduleGroups");
  return groups;
};
