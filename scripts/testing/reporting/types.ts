import type { z } from "zod";
import type { PhaseResult } from "../phases/types";
import type { Scope } from "../scenarios/types";
import type { testReportSchema } from "./schema";
export type TestReport = z.infer<typeof testReportSchema>;
export type TestReportInput = Readonly<{
  scope: Scope;
  testRunId: string;
  seed: string;
  version: Readonly<Record<string, string>>;
  setup: TestReport["setup"];
  phases: readonly PhaseResult[];
  coverageErrors: readonly string[];
}>;
