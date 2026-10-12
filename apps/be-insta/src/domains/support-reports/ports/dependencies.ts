import type { Result } from "@bloodyowl/boxed";
import type { ReportInput, SupportError } from "../domain/types";
import type { Jobs } from "./jobs";
import type { Limits } from "./limits";
import type { Proof } from "./proof";
import type { Reports } from "./reports";
export type SupportDependencies = Readonly<{
  reports: Reports;
  proof: Proof;
  limits: Limits;
  actor: (token: string) => Promise<Result<string, SupportError>>;
  fingerprint: (input: ReportInput) => string;
  clock: () => number;
  uuid: () => string;
  jobs: Jobs;
}>;
