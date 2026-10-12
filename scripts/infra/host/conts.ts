export const hostDefaults = {
  mongoPort: 27017,
  brokerPort: 6379,
  deliveryBrokerPort: 6380,
  smtpPort: 1025,
  mailpitPort: 18025,
  frontendPort: 3000,
  vitePort: 5173,
  viteHMRPort: 5174,
  backendPort: 3001,
  httpPort: 80,
  httpsPort: 443,
  storiesPort: 9000,
} as const;
export const loopbackHost = "127.0.0.1";
export const unspecifiedIpv4Host = "0.0.0.0";
export const privilegedPortCeiling = 1024;
export const maxPort = 65535;
export const hostModeLabel = "insta.runtime-mode";
export const hostSettingsLabel = "insta.host-settings";
export const hostMode = "host";
export const frontendService = "fe-insta";
export const mongoService = "mongo";
export const backendService = "be-insta";
export const brokerService = "dragonfly";
export const mongoContainerPort = 27017;
export const brokerContainerPort = 6379;
export const tcpRelayScriptPath = "/tmp/insta-tcp-relay.ts";
export const localFrontendMarker = "INSTA_LOCAL_FRONTEND";
export const localRealtimeOrigin = "INSTA_LOCAL_REALTIME_ORIGIN";
export const storiesModeInspectTemplate =
  '{{range .Config.Env}}{{if eq (index (split . "=") 0) "STORIES_MODE"}}{{println .}}{{end}}{{end}}';
export const storiesModeValues = ["disabled", "enabled"] as const;
export const startupStoriesOverrideKeys = [
  "STORIES_ACTIVE_PROFILE",
  "STORIES_STORAGE_PROFILES",
  "STORIES_MAX_DURATION_MS",
  "STORIES_LIFETIME_MS",
] as const;
export const infrastructureServices = [
  "mongo",
  "dragonfly",
  "mailpit",
] as const;
export const initServices = ["mongo-init", "broker-init"] as const;
export const startupLockTimeoutMs = 180000;
export const shutdownTimeoutMs = 15000;
export const startupLockPollMs = 100;
export const hostOverlay = "infra/compose/host.yaml";
export const environmentKeys = {
  mongoRootPassword: "MONGO_ROOT_PASSWORD",
  apiMongoPassword: "API_MONGO_PASSWORD",
  webMongoPassword: "WEB_MONGO_PASSWORD",
  brokerPassword: "DRAGONFLY_PASSWORD",
  deliveryBrokerPassword: "DELIVERY_DRAGONFLY_PASSWORD",
  authSigningKey: "AUTH_SIGNING_KEY",
  sessionEncryptionKey: "SESSION_ENCRYPTION_KEY",
  bffSourceSigningKey: "BFF_SOURCE_SIGNING_KEY",
  host: "HOST",
  port: "PORT",
  apiMongoUrl: "API_MONGO_URL",
  brokerUrl: "DRAGONFLY_URL",
  deliveryBrokerUrl: "DELIVERY_DRAGONFLY_URL",
  realtimeOrigin: "REALTIME_ORIGIN",
  smtpHost: "SMTP_HOST",
  smtpPort: "SMTP_PORT",
  supportSmtpHost: "SUPPORT_SMTP_HOST",
  supportSmtpPort: "SUPPORT_SMTP_PORT",
  mailpitUrl: "MAILPIT_URL",
  storiesMode: "STORIES_MODE",
  storiesActiveProfile: "STORIES_ACTIVE_PROFILE",
  storiesAccessKey: "STORIES_ACCESS_KEY",
  storiesSecretKey: "STORIES_SECRET_KEY",
  storiesStorageProfiles: "STORIES_STORAGE_PROFILES",
  storiesMaxDurationMs: "STORIES_MAX_DURATION_MS",
  storiesLifetimeMs: "STORIES_LIFETIME_MS",
  webOrigin: "WEB_ORIGIN",
  webMongoUrl: "WEB_MONGO_URL",
  apiBaseUrl: "API_BASE_URL",
  origin: "ORIGIN",
  devOrigin: "INSTA_HOST_DEV_ORIGIN",
  trustedWebProxyHost: "TRUSTED_WEB_PROXY_HOST",
  hostMongoPort: "HOST_MONGO_PORT",
  hostBrokerPort: "HOST_DRAGONFLY_PORT",
  hostDeliveryBrokerPort: "HOST_DELIVERY_DRAGONFLY_PORT",
  hostSmtpPort: "HOST_SMTP_PORT",
  mailpitPort: "MAILPIT_PORT",
  httpPort: "HTTP_PORT",
  httpsPort: "HTTPS_PORT",
  fingerprint: "INSTA_HOST_SETTINGS",
  proxyConfig: "HOST_PROXY_CONFIG",
  proxyStaticConfig: "HOST_PROXY_STATIC_CONFIG",
  backendPort: "BE_PORT",
  frontendPort: "FE_PORT",
  vitePort: "VITE_PORT",
  viteHMRPort: "VITE_HMR_PORT",
  localHMRPort: "INSTA_LOCAL_HMR_PORT",
} as const;
export const dockerFields = {
  id: "Id",
  config: "Config",
  labels: "Labels",
  state: "State",
  running: "Running",
  status: "Status",
  exitCode: "ExitCode",
  startedAt: "StartedAt",
  finishedAt: "FinishedAt",
  health: "Health",
  image: "Image",
  networkSettings: "NetworkSettings",
  ports: "Ports",
  networks: "Networks",
  aliases: "Aliases",
  hostIp: "HostIp",
  hostPort: "HostPort",
} as const;
export const connectTimeoutMs = 500;
