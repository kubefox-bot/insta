import {
  CommonErrorCode,
  MessageErrorCode,
  SessionErrorCode,
} from "@insta/contracts/errors";
export const sendCodes = {
  forbidden: CommonErrorCode.Forbidden,
  changed: SessionErrorCode.ActorChanged,
  required: SessionErrorCode.SessionRequired,
  busy: SessionErrorCode.SessionBusy,
  unavailable: SessionErrorCode.SessionUnavailable,
  invalid: MessageErrorCode.InvalidMessage,
} as const;
export const sendStatus = {
  [sendCodes.forbidden]: 403,
  [sendCodes.changed]: 409,
  [sendCodes.required]: 401,
  [sendCodes.busy]: 503,
  [sendCodes.unavailable]: 503,
  [sendCodes.invalid]: 400,
} as const satisfies Record<(typeof sendCodes)[keyof typeof sendCodes], number>;
export const upstreamUnavailableStatus = 503;
export const minimumErrorStatus = 400;
export const maximumErrorStatus = 599;
export const maximumIdempotencyKeyLength = 128;
export const maximumHistoryLimit = 100;
export const maximumCursorLength = 1024;
