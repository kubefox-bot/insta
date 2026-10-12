import type * as ts from "typescript/unstable/ast";
import type {
  Project,
  Symbol as SourceSymbol,
} from "typescript/unstable/async";

export type SymbolAtLocation = (
  identifier: ts.Identifier,
) => Promise<SourceSymbol | undefined>;
export type SourceProject = Readonly<{
  project: Project;
  sourceFiles: (absolutePath: string) => Promise<readonly ts.SourceFile[]>;
  symbolAtLocation: SymbolAtLocation;
}>;
