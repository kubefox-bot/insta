export type ModuleBoundariesConfig = Readonly<{
  sourceRoot: string;
  forbiddenDependencies?: readonly Readonly<{
    source: string;
    target: string;
  }>[];
  layers: readonly Readonly<{
    name: string;
    root: string;
    allow: readonly string[];
  }>[];
  moduleGroups: readonly Readonly<{
    root: string;
    publicEntrypoints: readonly string[];
    forbidCycles: boolean;
  }>[];
}>;
export type ModuleBoundaryFinding = Readonly<{
  rule:
    | "forbidden-dependency"
    | "private-module-import"
    | "layer-dependency"
    | "module-cycle"
    | "dynamic-module-import"
    | "unresolved-local-import"
    | "unanalyzed-local-import";
  path: string;
  message: string;
}>;
export type ModuleBoundaryResult = Readonly<{
  findings: readonly ModuleBoundaryFinding[];
}>;
export type ModuleEdge = Readonly<{
  source: string;
  target: string;
  via: readonly string[];
}>;
export type ImportGraph = ReadonlyMap<string, readonly string[]>;
