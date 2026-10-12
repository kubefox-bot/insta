export const originKey = "INSTA_HOST_DEV_ORIGIN";
export const realtimeOriginKey = "INSTA_LOCAL_REALTIME_ORIGIN";
export const apiBaseUrlKey = "API_BASE_URL";
export const localFrontendMarker = "INSTA_LOCAL_FRONTEND";
export const localHMRPortKey = "INSTA_LOCAL_HMR_PORT";
export const localHMRHost = "127.0.0.1";
export const maxLocalPort = 65535;
export const localOriginPolicy = {
  protocol: "https:",
  hostname: "localhost",
} as const;
export const localApiOriginPolicy = {
  protocol: "http:",
  hostnames: ["127.0.0.1", "localhost"],
} as const;
