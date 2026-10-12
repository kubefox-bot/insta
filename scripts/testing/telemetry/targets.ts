import { telemetryPhaseNames } from "../conts";
import type { PhaseTarget } from "../phases/types";
export const createTelemetrySetupTarget = ({
  prefix,
  activePath,
  ownedPath,
  runId,
  image,
}: {
  readonly prefix: readonly string[];
  readonly activePath: string;
  readonly ownedPath: string;
  readonly runId: string;
  readonly image: string;
}): PhaseTarget => ({
  name: telemetryPhaseNames.setup,
  paths: ["receiver-setup"],
  commands: [
    [
      process.execPath,
      "scripts/testing/telemetry/check-receiver.ts",
      "available",
      runId,
      image,
    ],
    [
      ...prefix,
      "-f",
      activePath,
      "-f",
      ownedPath,
      "--profile",
      "telemetry",
      "up",
      "-d",
      "--no-build",
      "--pull",
      "never",
      "--no-deps",
      "telemetry-receiver",
      "be-insta",
      "fe-insta",
    ],
    [process.execPath, "scripts/testing/telemetry/ready.ts"],
    [
      process.execPath,
      "scripts/testing/telemetry/check-receiver.ts",
      "owned",
      runId,
      image,
    ],
  ],
});
export const createTelemetryRestoreTargets = ({
  prefix,
  defaultPath,
  runId,
}: {
  readonly prefix: readonly string[];
  readonly defaultPath: string;
  readonly runId: string;
}): readonly PhaseTarget[] => [
  {
    name: telemetryPhaseNames.restore,
    paths: ["default-restoration"],
    commands: [
      [
        ...prefix,
        "-f",
        defaultPath,
        "up",
        "-d",
        "--no-build",
        "--pull",
        "never",
        "--no-deps",
        "be-insta",
        "fe-insta",
      ],
      [process.execPath, "scripts/testing/telemetry/ready.ts"],
    ],
  },
  {
    name: telemetryPhaseNames.stop,
    paths: ["receiver-stop"],
    commands: [
      [process.execPath, "scripts/testing/telemetry/stop-owned.ts", runId],
    ],
  },
];
export const createTelemetryTestTarget = (): PhaseTarget => ({
  name: telemetryPhaseNames.tests,
  paths: ["__tests__/e2e/main-telemetry.spec.ts"],
  commands: [
    [
      process.execPath,
      "node_modules/@playwright/test/cli.js",
      "test",
      "--config",
      "__tests__/e2e/playwright.config.ts",
      "__tests__/e2e/main-telemetry.spec.ts",
    ],
  ],
});
