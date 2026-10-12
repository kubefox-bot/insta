export const defaults = {
  realtimeOrigin: "https://localhost",
  host: "127.0.0.1",
  port: 3001,
  database: "insta_api",
  timeoutMs: 10000,
  mongoPoolSize: 10,
  smtpHost: "mailpit",
  smtpPort: 1025,
  supportRecipient: "support@insta.test",
  supportSmtpHost: "mailpit",
  supportSmtpPort: 1025,
  mailpitUrl: "http://mailpit:8025",
  logLevel: "info",
  logFlushTimeoutMs: 1000,
  shutdownMs: 15000,
  deliveryProbeTimeoutMs: 500,
} as const;
export const defaultBrokerPort = "6379";
export const maxPort = 65535;
export const secretHexLength = 64;
export const authLimitsKeyContext = "insta:auth-limits:v1";

export const authReplayKeyContext = "insta/users/auth/replay/v1";
export const localSupportHosts = ["mailpit", "localhost", "127.0.0.1"] as const;
export const telemetryReceiverPolicy = {
  protocol: "http:",
  hosts: ["localhost", "127.0.0.1", "telemetry-receiver"],
  path: "/v1/traces",
} as const;
export const mongoReplicaSet = "rs0";
export const supportRecipientSuffix = "@insta.test";
