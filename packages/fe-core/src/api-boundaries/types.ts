import type {
  apiBoundaryRules,
  apiBoundaryScopedExceptionRules,
} from "./conts.ts";

export type ApiBoundaryRule = (typeof apiBoundaryRules)[number];

export type ApiBoundaryScopedExceptionRule =
  (typeof apiBoundaryScopedExceptionRules)[number];

export type ApiBoundaryScopedException = {
  allowedRules: readonly ApiBoundaryScopedExceptionRule[];
  path: string;
  reason: string;
};

export type ApiBoundaryConfig = {
  browserTransportFiles?: readonly string[];
  clientEntryFiles: readonly string[];
  generatedRoot: string;
  transportPackageSpecifiers?: readonly string[];
  scopedExceptionFiles?: readonly ApiBoundaryScopedException[];
  serverApiFiles?: readonly string[];
  serverServiceFiles?: readonly string[];
  serverApiRoots: readonly string[];
  sourceRoot: string;
  transportFiles: readonly string[];
};

export type ApiBoundaryFinding = {
  example: string;
  message: string;
  path: string;
  rule: ApiBoundaryRule;
};

export type ApiBoundaryResult = {
  findings: ApiBoundaryFinding[];
};
export type BrowserTransportConfiguration = Readonly<{
  paths: readonly string[];
  serverFiles: readonly string[];
  serverRoots: readonly string[];
  generatedRoot: string;
  serverTransports: readonly string[];
}>;
