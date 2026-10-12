export const phases = ["integration", "abuse", "e2e"] as const;
export const testResults = ["pass", "fail", "not-run"] as const;
export const testTimeoutMs = 60000;
export const cleanupPolicy = {
  container: { labelField: ".Config.Labels", options: ["-f"] },
  volume: { labelField: ".Labels", options: [] },
  network: { labelField: ".Labels", options: [] },
} as const;
export const artifactPermissions = { directory: 0o700, file: 0o600 } as const;
export const phaseDeadlineMs = 900000;
export const approvedComposeProjects = {
  core: "insta-core",
  full: "insta-stories",
} as const;
export const ownedAcceptanceProjectPrefix = "insta-acceptance-";
export const acceptanceRunSuffixPattern = /^[a-f0-9]{12}$/;
export const inspectFields = {
  image: "Image",
  state: "State",
  running: "Running",
  health: "Health",
  status: "Status",
  mounts: "Mounts",
  destination: "Destination",
} as const;
export const composeFields = { workingDirectory: "working_dir" } as const;
export const telemetrySourceKeys = {
  faro: "FARO_RECEIVER_URL",
  otel: "OTEL_RECEIVER_URL",
} as const;
export const telemetrySetupDeadlineMs = 30000;
export const readinessRequestDeadlineMs = 2000;
export const http3ClientImage =
  "ghcr.io/macbre/curl-http3@sha256:c3a360869a4e132180f458f83af2ce67b873b2302739eda27274dad4f62155f8";
export const artifactUmask = 0o077;
export const telemetryPhaseNames = {
  setup: "optional-telemetry-setup",
  tests: "optional-main-telemetry",
  restore: "default-restoration",
  stop: "owned-receiver-stop",
} as const;
export const acceptanceEnvironmentKeys = {
  composeFile: "COMPOSE_FILE",
} as const;
export const coreStoriesMode = "disabled";
