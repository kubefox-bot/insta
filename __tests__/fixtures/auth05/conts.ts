export const fixturePort = 3002;
export const fixtureStopTimeoutSeconds = 15;
export const fixtureFetchTimeoutMs = 500;
export const fixtureReadinessTimeoutMs = 15000;
export const defaultHostMailpitPort = 18025;
export const maximumHostPort = 65535;
export const currentSourceMounts = [
  "__tests__",
  "scripts",
  "apps/be-insta/src",
  "apps/fe-insta/src",
  "packages/contracts/src",
  "packages/fe-core/src",
  "package.json",
  "bun.lock",
  "apps/be-insta/package.json",
  "apps/fe-insta/package.json",
  "packages/contracts/package.json",
  "packages/fe-core/package.json",
] as const;
