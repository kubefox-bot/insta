export const shutdownTimeoutMs = 15_000;
export const applicationServicesToken = "SERVICES_LIFECYCLE";
export const startupCloseOrder = [
  "services",
  "observability",
  "application",
  "infrastructure",
] as const;
