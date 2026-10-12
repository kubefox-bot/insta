import { chmod, mkdir, unlink } from "node:fs/promises";
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
import { readPhase, selectPhaseTargets } from "./phases/select";
import { verifyPreparedEnvironment } from "./setup";

const [phaseArgument, ...args] = process.argv.slice(2);
const phase = readPhase(phaseArgument);
const requested = args.filter(
  (argument) => argument !== "--" && !argument.startsWith("--"),
);
process.umask(artifactUmask);
const config = readAcceptanceConfig(
  args.filter((argument) => argument.startsWith("--") && argument !== "--"),
);
const images = await verifyPreparedEnvironment(config);
const directory = `.infra/acceptance/${crypto.randomUUID()}`;
await mkdir(directory, {
  recursive: true,
  mode: artifactPermissions.directory,
});
await chmod(directory, artifactPermissions.directory);
const overlay = `${directory}/compose.json`;
await Bun.write(overlay, JSON.stringify(createPreparedProfile(images)));
await chmod(overlay, artifactPermissions.file);
try {
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
  const planned = await createPhaseTargets({
    scope: config.scope,
    dockerPrefix,
    includeSourceChecks: false,
  });
  const targets = selectPhaseTargets({ phase, planned, requested });
  let count = 0;
  const result = await runPhases({
    targets,
    retry: config.retry,
    execute: (command) =>
      executeCommand({
        command,
        directory,
        name: `command-${++count}`,
        environment: {
          ...readAcceptanceEnvironment(config),
          [acceptanceEnvironmentKeys.composeFile]: [
            ...(config["stories-profile"]
              ? ["compose.yaml", config["stories-profile"]]
              : ["compose.yaml"]),
            overlay,
          ].join(":"),
        },
      }),
  });
  process.stdout.write(
    `${JSON.stringify({ phase, result, evidence: directory })}\n`,
  );
  process.exitCode = result.every(
    (entry) => entry.result === "pass" && !entry.flake,
  )
    ? 0
    : 1;
} finally {
  await unlink(overlay);
}
