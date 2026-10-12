import { unlink } from "node:fs/promises";
import { runPhases } from "../phases/run";
import type { CommandResult, PhaseResult } from "../phases/types";
import type { AcceptanceConfig } from "../types";
import { prepareTelemetryOwnership } from "./prepare";
import {
  createTelemetryRestoreTargets,
  createTelemetrySetupTarget,
  createTelemetryTestTarget,
} from "./targets";

export const runTelemetryPhase = async ({
  config,
  execute,
  directory,
  testRunId,
}: {
  readonly config: AcceptanceConfig;
  readonly execute: (command: readonly string[]) => Promise<CommandResult>;
  readonly directory: string;
  readonly testRunId: string;
}): Promise<readonly PhaseResult[]> => {
  const target = createTelemetryTestTarget();
  const notRun: PhaseResult = {
    name: target.name,
    paths: target.paths,
    result: "not-run",
    attempts: [],
    flake: false,
  };
  if (
    !config["telemetry-profile"] ||
    !config["default-profile"] ||
    !config["testhost-image"]
  )
    return [notRun];
  const { ownedPath, runId, prefix } = await prepareTelemetryOwnership({
    config,
    directory,
    testRunId,
    activePath: config["telemetry-profile"],
    defaultPath: config["default-profile"],
  });
  const results: PhaseResult[] = [];
  try {
    const setup = await runPhases({
      targets: [
        createTelemetrySetupTarget({
          prefix,
          activePath: config["telemetry-profile"],
          ownedPath,
          runId,
          image: config["testhost-image"],
        }),
      ],
      execute,
      retry: 0,
    });
    results.push(...setup);
    const tests = setup.every((phase) => phase.result === "pass")
      ? await runPhases({ targets: [target], execute, retry: config.retry })
      : [notRun];
    results.push(...tests);
  } finally {
    results.push(
      ...(await runPhases({
        targets: createTelemetryRestoreTargets({
          prefix,
          defaultPath: config["default-profile"],
          runId,
        }),
        execute,
        retry: 0,
      })),
    );
    await unlink(ownedPath);
  }
  return results;
};
