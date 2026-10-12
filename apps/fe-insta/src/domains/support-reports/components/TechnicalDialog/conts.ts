import type { SupportFailure } from "../../domain/types";
export const emailCopyKeys = {
  pending: "emailPending",
  accepted: "emailAccepted",
  failed: "emailFailed",
} as const;
export const failureCopyKeys = {
  unknown: "failed",
  contextInvalid: "scopeInvalid",
  actorChanged: "actorChanged",
  identityUnavailable: "failed",
  conflict: "failed",
  rateLimited: "failed",
  invalidInput: "failed",
  forbidden: "failed",
} as const satisfies Record<
  SupportFailure,
  "failed" | "scopeInvalid" | "actorChanged"
>;
