import { isInside } from "../paths.ts";
import type { ModuleBoundariesConfig } from "../types.ts";
import {
  array,
  assertDisjoint,
  exactKeys,
  path,
  record,
  strings,
} from "./values.ts";
/**
 * Требует непустые непересекающиеся слои строго внутри sourceRoot, уникальные имена и allow только на объявленные слои; неверный контракт бросает TypeError.
 */
export const parseLayers = ({
  value,
  sourceRoot,
}: Readonly<{
  value: unknown;
  sourceRoot: string;
}>): ModuleBoundariesConfig["layers"] => {
  const layers = array(value, "layers").map((value) => {
    const layer = record(value, "layer");
    exactKeys(layer, ["name", "root", "allow"], "layer");
    if (typeof layer.name !== "string" || !layer.name.trim())
      throw new TypeError("layer.name: ожидается непустая строка");
    const root = path(layer.root, "layer.root");
    if (!isInside(root, sourceRoot) || root === sourceRoot)
      throw new TypeError("layer.root: ожидается каталог внутри sourceRoot");
    return {
      name: layer.name,
      root,
      allow: strings(layer.allow, "layer.allow"),
    };
  });
  if (!layers.length)
    throw new TypeError("layers: нужен хотя бы один владелец");
  assertDisjoint(layers, "layers");
  const names = new Set(layers.map(({ name }) => name));
  if (names.size !== layers.length)
    throw new TypeError("layers: имена должны быть уникальными");
  for (const layer of layers) {
    if (layer.allow.some((name) => !names.has(name)))
      throw new TypeError(`layer.allow: неизвестный владелец ${layer.name}`);
  }
  return layers;
};
