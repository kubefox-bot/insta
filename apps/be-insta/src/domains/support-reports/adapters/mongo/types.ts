import type { ConsentReference } from "@insta/fe-core/observability/analytics";
import type { ClientSession, Db } from "mongodb";
import type { StoredReport } from "../../domain/types";
export type Connection = Readonly<{
  apiDb: Db;
  namespace?: string;
  startSession: () => ClientSession;
  analyticsReference?: () => ConsentReference | undefined;
}>;
export type ReportDocument = StoredReport & {
  _id: string;
  emailState: "pending" | "accepted" | "failed";
  attempts: number;
  leaseId?: string;
  leaseUntil: number;
  nextAttemptAt: number;
  event: Readonly<{
    name: "support_report_submitted";
    operationId: string;
    reportId: string;
  }>;
};
export type ReplayDocument = {
  _id: string;
  reportId: string;
  fingerprint: string;
  expiresAt: number;
};
