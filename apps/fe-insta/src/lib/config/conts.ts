export const defaultApiTimeoutMs = 10000;
export const defaultApiMaxResponseBytes = 1048576;
export const maxApiTimeoutMs = 60000;
export const maxApiResponseBytes = 16777216;
export const defaultMongoPoolSize = 10;
export const webDatabaseName = "insta_web";
export const defaultLogLevel = "info";
export const logFlushTimeoutMs = 1000;
export const privacyKeyBytes = 32;
export const privacyKeyPurpose = "insta/privacy/cookie/v1";
export const sessionKeyPurposes = {
  cookieKey: "insta/session/cookie/v1",
  credentialsKey: "insta/session/credentials/v1",
  revokeKey: "insta/session/revocation/v1",
} as const;
export const sessionKeyBytes = 32;
