import type { SupportErrorCode } from "@insta/contracts/errors";

export type SupportError = SupportErrorCode;
export type Owner = Readonly<{ kind: "user" | "guest"; id: string }>;
export type ReportInput = Readonly<{
  comment: string;
  errorCode: string;
  originalRequestId?: string | undefined;
}>;
export type Receipt = Readonly<{
  reportId: string;
  emailState: "pending" | "accepted" | "failed";
}>;
export type StoredReport = ReportInput &
  Readonly<{
    reportId: string;
    owner: Owner;
    fingerprint: string;
    idempotencyKey: string;
    operationId: string;
    createdAt: number;
    expiresAt: number;
    replayExpiresAt: number;
  }>;
export type MailJob = StoredReport &
  Readonly<{ leaseId: string; attempts: number }>;
