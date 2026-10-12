import { SessionErrorCode } from "@insta/contracts/errors";
export const refreshLeaseMs = 15000;
export const refreshRecoveryMs = 120000;
export const refreshPollBudgetMs = 5000;
export const refreshPollIntervalMs = 100;
const revokeDelaysMs = {
  first: 1000,
  second: 2000,
  third: 4000,
  fourth: 8000,
  fifth: 16000,
} as const;
export const revocationBackoffMs = [
  revokeDelaysMs.first,
  revokeDelaysMs.second,
  revokeDelaysMs.third,
  revokeDelaysMs.fourth,
  revokeDelaysMs.fifth,
] as const;
export const revocationWaveDelayMs = 60000;
export const revocationBatchSize = 20;
export const sessionCollection = "bff_sessions";
export const sessionCookieName = "insta_session";
export const cookieIssuer = "insta-bff";
export const cookieAudience = "insta-browser-session";
export const millisecondsPerSecond = 1000;
export const revocationWorkerIntervalMs = 1000;
const sessionCodes = {
  required: SessionErrorCode.SessionRequired,
  unavailable: SessionErrorCode.SessionUnavailable,
  busy: SessionErrorCode.SessionBusy,
  changed: SessionErrorCode.ActorChanged,
} as const;
export const webSessionStatuses = {
  [sessionCodes.required]: 401,
  [sessionCodes.unavailable]: 503,
  [sessionCodes.busy]: 503,
  [sessionCodes.changed]: 409,
} as const;

export const jwePolicy = { algorithm: "dir", encryption: "A256GCM" } as const;
