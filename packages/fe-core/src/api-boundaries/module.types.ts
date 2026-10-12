import type * as ts from "typescript/unstable/ast";
import type { Project } from "typescript/unstable/async";
import type { SymbolAtLocation } from "../lib/source-analysis/index.ts";
import type { HttpClientDefinition } from "./http-clients/types.ts";

export type SourceFile = {
  absolutePath: string;
  path: string;
};

export type ModuleReference = {
  specifier: string;
  target?: string;
};

export type ParsedModule = {
  scriptModules?: readonly ParsedModule[];
  dynamicImports: number;
  httpClientBindings: HttpClientBinding[];
  imports: ModuleReference[];
  sourceFile: ts.SourceFile;
  usesClientDirective: boolean;
  usesServerDirective: boolean;
};

export type HttpClientBinding = HttpClientDefinition & {
  identifier: ts.Identifier;
};

export type TsconfigPaths = {
  baseUrl: string;
  paths: Record<string, readonly string[]>;
};

export type HttpSymbolContext = Readonly<{
  project: Project;
  symbolAtLocation: SymbolAtLocation;
}>;
