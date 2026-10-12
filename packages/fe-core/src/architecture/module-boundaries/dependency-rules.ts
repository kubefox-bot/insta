import type {
  ImportGraph,
  ModuleBoundariesConfig,
  ModuleBoundaryFinding,
} from "./types.ts";

/**
 * Сопоставляет каждое прямое ребро графа с source/target Bun.Glob запретами; несколько совпавших правил дают одну находку на ребро.
 */
export const checkForbiddenDependencies = (
  graph: ImportGraph,
  rules: ModuleBoundariesConfig["forbiddenDependencies"],
): ModuleBoundaryFinding[] => {
  const patterns = (rules ?? []).map((rule) => ({
    source: new Bun.Glob(rule.source),
    target: new Bun.Glob(rule.target),
  }));
  return [...graph].flatMap(([source, targets]) =>
    targets.flatMap((target) =>
      patterns.some(
        (pattern) =>
          pattern.source.match(source) && pattern.target.match(target),
      )
        ? [
            {
              rule: "forbidden-dependency" as const,
              path: source,
              message: `Запрещённая зависимость ${source} → ${target}`,
            },
          ]
        : [],
    ),
  );
};
