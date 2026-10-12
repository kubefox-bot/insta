import type { Result } from "@bloodyowl/boxed";
import type {
  MailJob,
  Owner,
  Receipt,
  StoredReport,
  SupportError,
} from "../domain/types";
export type Reports = Readonly<{
  save: (input: StoredReport) => Promise<Result<Receipt, SupportError>>;
  replay: (
    input: Readonly<{
      owner: Owner;
      idempotencyKey: string;
      fingerprint: string;
      now: number;
    }>,
  ) => Promise<Result<Receipt | null, SupportError>>;
  recover: (now: number) => Promise<ReadonlyArray<string>>;
  claim: (
    input: Readonly<{ reportId: string; now: number; leaseId: string }>,
  ) => Promise<MailJob | null>;
  finish: (
    input: Readonly<{ job: MailJob; state: "accepted" | "retry"; now: number }>,
  ) => Promise<void>;
  cleanup: (now: number) => Promise<void>;
}>;
