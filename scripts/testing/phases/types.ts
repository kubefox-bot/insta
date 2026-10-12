import type { phases } from "../conts";
import type { TestResult } from "../types";

export type Phase = (typeof phases)[number];
export type OwnerCoverage = "full-owner" | "filtered";
export type PhaseTarget = Readonly<{
  name: string;
  paths: readonly string[];
  coverage?: OwnerCoverage;
  commands: readonly (readonly string[])[];
}>;
export type CommandResult = Readonly<{ code: number; evidence: string }>;
export type PhaseAttempt = Readonly<{
  code: number;
  evidence: readonly string[];
  actual: string;
}>;
export type PhaseResult = Readonly<{
  name: string;
  paths: readonly string[];
  coverage?: OwnerCoverage;
  result: TestResult;
  attempts: readonly PhaseAttempt[];
  flake: boolean;
}>;
export type AcceptanceScope = "core" | "full";
