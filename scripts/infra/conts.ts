export const secretBytes = 32;
export const mongoKeyBytes = 96;
export const privateFileMode = 0o600;
export const privateDirectoryMode = 0o700;
export const privateUmask = 0o077;

export const dockerDeadlineMs = 120000;
export const readinessDeadlineMs = 15000;
export const readinessPollMs = 50;
export const composeWaitTimeoutSeconds = 180;
export const dockerEndpointSchemes = {
  unixSocket: "unix:///",
  windowsNamedPipe: "npipe:///",
} as const;
export const localCertificatePolicy = {
  validityDays: 30,
  rsaBits: 2048,
} as const;
