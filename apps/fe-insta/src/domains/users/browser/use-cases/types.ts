import type { AuthBrowserIssueCode } from "../codes";
import type { AuthBrowser } from "../types";
export type SubmissionOutcome = Readonly<{
  state: "applied" | "reconciled";
  revocation?: "pending" | "confirmed";
}>;
export type SubmissionPorts<Receipt> = Readonly<{
  auth: Pick<
    AuthBrowser,
    | "beginLogout"
    | "finishLogout"
    | "exclusive"
    | "reconcile"
    | "clearSubmissionIssue"
    | "reportPrivateCleanupFailure"
  >;
  post: () => Promise<
    Readonly<{
      receipt: Receipt;
      successful: boolean;
      revocation?: "pending" | "confirmed";
    }>
  >;
  apply: (receipt: Receipt) => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
  onPending: (pending: boolean) => void;
}>;

export type SubmissionFailure = Readonly<{
  code: AuthBrowserIssueCode;
  cause: unknown;
  outcome: SubmissionOutcome;
}>;
