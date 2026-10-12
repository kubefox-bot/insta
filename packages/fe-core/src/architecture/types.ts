export type ArchitectureMode = "warn" | "strict";
export type ArchitecturePreset = "domain-first-next" | "module-style";

export type ArchitectureConfig = {
  sourceRoot: string;
  preset?: ArchitecturePreset;
  mode?: ArchitectureMode;
  resultBoundary?: string;
  disallowedExternalImports?: string[];
  exportCountAllowlist?: string[];
  environmentFiles?: readonly string[];
  entrypointFiles?: readonly string[];
};

export type ArchitectureFinding = {
  rule: string;
  path: string;
  message: string;
  example: string;
};

export type ArchitectureResult = {
  findings: ArchitectureFinding[];
  mode: ArchitectureMode;
};
