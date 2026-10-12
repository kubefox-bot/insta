import {
  CommonErrorCode,
  SessionErrorCode,
  SupportErrorCode,
} from "@insta/contracts/errors";
import type { SupportFailure } from "../domain/types";
export const supportTransport = {
  contextPath: "/api/support/form-context",
  submitPath: "/api/support",
  timeoutMs: 15000,
} as const;
export const supportWireErrors = {
  contextInvalid: SupportErrorCode.SupportContextInvalid,
  actorChanged: SessionErrorCode.ActorChanged,
  identityUnavailable: SupportErrorCode.SupportIdentityUnavailable,
  conflict: SupportErrorCode.SupportConflict,
  rateLimited: SupportErrorCode.SupportRateLimited,
  invalidInput: CommonErrorCode.ValidationFailed,
  forbidden: CommonErrorCode.Forbidden,
  unavailable: SupportErrorCode.SupportUnavailable,
  internal: CommonErrorCode.InternalError,
  dependencyUnavailable: CommonErrorCode.DependencyUnavailable,
} as const;
export const supportFailureCodes = {
  [supportWireErrors.contextInvalid]: "contextInvalid",
  [supportWireErrors.actorChanged]: "actorChanged",
  [supportWireErrors.identityUnavailable]: "identityUnavailable",
  [supportWireErrors.conflict]: "conflict",
  [supportWireErrors.rateLimited]: "rateLimited",
  [supportWireErrors.invalidInput]: "invalidInput",
  [supportWireErrors.forbidden]: "forbidden",
  [supportWireErrors.unavailable]: "unknown",
  [supportWireErrors.internal]: "unknown",
  [supportWireErrors.dependencyUnavailable]: "unknown",
} as const satisfies Record<
  (typeof supportWireErrors)[keyof typeof supportWireErrors],
  SupportFailure
>;
