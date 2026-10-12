import type { z } from "zod";
import type { supportReceiptSchema } from "./receipt";
export type SupportReceipt = z.infer<typeof supportReceiptSchema>;
export type SupportIssue = Readonly<{
  errorCode: string;
  originalRequestId?: string;
}>;
export type SupportSubmission = SupportIssue &
  Readonly<{ comment: string; scopeId: string; idempotencyKey: string }>;
export type SupportFailure =
  | "unknown"
  | "contextInvalid"
  | "actorChanged"
  | "identityUnavailable"
  | "conflict"
  | "rateLimited"
  | "invalidInput"
  | "forbidden";
export type Attempt =
  | Readonly<{ kind: "idle" }>
  | Readonly<{
      kind: "sending";
      payload: SupportSubmission;
      uncertain: boolean;
    }>
  | Readonly<{
      kind: "failed";
      payload: SupportSubmission;
      failure: SupportFailure;
      uncertain: boolean;
    }>
  | Readonly<{
      kind: "saved";
      payload: SupportSubmission;
      receipt: SupportReceipt;
    }>;
export type FormScope =
  | Readonly<{ kind: "empty" | "loading" | "unavailable" }>
  | Readonly<{ kind: "ready"; scopeId: string; idempotencyKey: string }>;
