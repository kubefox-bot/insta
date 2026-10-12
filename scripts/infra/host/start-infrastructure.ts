import { createCompose, requireSuccess } from "../commands/compose";
import type { OwnedProcesses } from "../commands/processes";
import { startDeliveryInfrastructure } from "../commands/start-delivery";
import { readInfrastructureBuildMode } from "../config";
import { composeWaitTimeoutSeconds } from "../conts";
import { initializeStoriesStorage } from "../stories/initialize";
import { initializedForProcess, inspectProject } from "./containers";
import { hostOverlay, infrastructureServices } from "./conts";

/** Поднимает зависимости с host-overlay и readiness timeout. Для init, не подтверждённого после текущего старта provider, запускает force-recreate с выбранным build mode и требует успешный exit; volumes сохраняются. */
export const startHostInfrastructure = async ({
  processes,
  environment,
  storiesEnabled,
}: {
  readonly processes: OwnedProcesses;
  readonly environment: Readonly<Record<string, string>>;
  readonly storiesEnabled: boolean;
}) => {
  const compose = createCompose({
    processes,
    overlay: hostOverlay,
    profiles: storiesEnabled ? ["stories"] : [],
    environment,
  });
  requireSuccess(
    await compose.run([
      "up",
      "--detach",
      "--wait",
      "--wait-timeout",
      String(composeWaitTimeoutSeconds),
      ...infrastructureServices,
      ...(storiesEnabled ? ["rustfs"] : []),
    ]),
  );
  const containers = await inspectProject(processes);
  for (const [service, dependency] of [
    ["mongo-init", "mongo"],
    ["broker-init", "dragonfly"],
  ] as const) {
    if (initializedForProcess({ containers, service, dependency })) continue;
    await compose.capture([
      "up",
      "--no-deps",
      "--force-recreate",
      readInfrastructureBuildMode() === "skip" ? "--no-build" : "--build",
      "--abort-on-container-exit",
      "--exit-code-from",
      service,
      service,
    ]);
  }
  await startDeliveryInfrastructure({
    compose,
    build: readInfrastructureBuildMode() !== "skip",
  });
  if (storiesEnabled)
    await initializeStoriesStorage({
      compose,
      build: readInfrastructureBuildMode() !== "skip",
    });
};
