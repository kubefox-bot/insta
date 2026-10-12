import { chmod, mkdir, unlink } from "node:fs/promises";
import { Result } from "@bloodyowl/boxed";
import { readAcceptanceConfig, readAcceptanceEnvironment } from "./config";
import {
  acceptanceEnvironmentKeys,
  artifactPermissions,
  artifactUmask,
} from "./conts";
import { createPreparedProfile } from "./environment/profile";
import { executeCommand } from "./phases/execute";
import { createPhaseTargets } from "./phases/plan";
import { runPhases } from "./phases/run";
import { buildTestReport } from "./reporting/build";
import { writeTestReport } from "./reporting/write";
import { scenarioOwners, verifyCoverage } from "./scenarios/index";
import { verifyPreparedEnvironment } from "./setup";
import { telemetryPreparationFailure } from "./telemetry/preparation-failure";
import { runTelemetryPhase } from "./telemetry/run";

process.umask(artifactUmask);
const config = readAcceptanceConfig(process.argv.slice(2));
const testRunId = crypto.randomUUID();
const directory = `.infra/acceptance/${testRunId}`;
await mkdir(directory, {
  recursive: true,
  mode: artifactPermissions.directory,
});
await chmod(directory, artifactPermissions.directory);
const coverage = verifyCoverage({
  scope: config.scope,
  owners: scenarioOwners,
});
const environment = readAcceptanceEnvironment(config);
let commandCount = 0;
const execute = (command: readonly string[]) =>
  executeCommand({
    command,
    directory,
    name: `command-${++commandCount}`,
    environment: {
      ...environment,
      [acceptanceEnvironmentKeys.composeFile]: [
        "compose.yaml",
        ...(config["stories-profile"] ? [config["stories-profile"]] : []),
        `${directory}/compose.json`,
      ].join(":"),
    },
  });
const setup = coverage.errors.length
  ? Result.Error(new Error("Required scope enrollment is incomplete"))
  : await Result.fromPromise(verifyPreparedEnvironment(config));
const overlay = `${directory}/compose.json`;
try {
  if (setup.isOk()) {
    await Bun.write(
      overlay,
      JSON.stringify(createPreparedProfile(setup.get())),
    );
    await chmod(overlay, artifactPermissions.file);
  }
  const dockerPrefix = [
    "docker",
    "--host",
    config.infrastructure.endpoint,
    "compose",
    "--project-name",
    config.infrastructure.project,
    "-f",
    "compose.yaml",
    ...(config["stories-profile"] ? ["-f", config["stories-profile"]] : []),
    "-f",
    overlay,
    "--profile",
    "test",
  ];
  const targets = await createPhaseTargets({
    dockerPrefix,
    scope: config.scope,
  });
  const phases = setup.isOk()
    ? await runPhases({ targets, execute, retry: config.retry })
    : targets.map((target) => ({
        name: target.name,
        paths: target.paths,
        coverage: target.coverage ?? "full-owner",
        result: "not-run" as const,
        attempts: [],
        flake: false,
      }));
  const telemetry = setup.isOk()
    ? await Result.fromPromise(
        runTelemetryPhase({ config, execute, directory, testRunId }),
      )
    : Result.Ok([]);
  const telemetryPhases = telemetry.isOk()
    ? telemetry.get()
    : telemetryPreparationFailure();
  const setupError = setup.isError() ? setup.getError() : undefined;
  const report = buildTestReport({
    scope: config.scope,
    testRunId,
    seed: testRunId,
    version: { bun: Bun.version, ...(setup.isOk() ? setup.get() : {}) },
    setup: setup.isOk()
      ? {
          result: "pass",
          actual:
            "Exact image IDs, healthy services, no source mounts and approved Docker ownership verified",
          evidence: [],
        }
      : {
          result: "fail",
          actual:
            setupError instanceof Error
              ? setupError.message
              : "Prepared setup failed",
          evidence: [],
        },
    phases: [...phases, ...telemetryPhases],
    coverageErrors: coverage.errors,
  });
  const path = await writeTestReport({ directory, report });
  process.stdout.write(
    `${JSON.stringify({ scope: config.scope, accepted: report.accepted, report: path, phases: report.phases.map((phase) => ({ phase: phase.name, result: phase.result, flake: phase.flake })) })}\n`,
  );
  process.exitCode = report.accepted ? 0 : 1;
} finally {
  if (await Bun.file(overlay).exists()) await unlink(overlay);
}
