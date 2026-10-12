import { readComposeOrigin } from "../config";
import {
  readHostSettings,
  readHostStoriesMode,
  readStartupEnvironment,
} from "../host/config";
import { inspectProject } from "../host/containers";
import { environmentKeys, hostDefaults } from "../host/conts";
import {
  assertMode,
  assertPortAvailable,
  assertProjectOwnership,
  assertUdpPortAvailable,
} from "../host/preflight";
import { initializeStoriesStorage } from "../stories/initialize";
import { createCompose, requireSuccess } from "./compose";
import { defaultApplicationServices } from "./conts";
import type { OwnedProcesses } from "./processes";
import { startDeliveryInfrastructure } from "./start-delivery";
/** Проверяет владение контейнерами, совместимость container mode и нужные TCP/UDP-порты. После подготовки конфигурации запускает выбранные сервисы с canonical localhost origin; возвращает код Compose. */
export const startCompose = async ({
  processes,
  services,
}: {
  readonly processes: OwnedProcesses;
  readonly services: readonly string[];
}) => {
  const containers = await inspectProject(processes);
  assertProjectOwnership(containers);
  assertMode({ containers, mode: "container" });
  const settings = readHostSettings();
  const storiesMode = readHostStoriesMode();
  const storiesEnabled = storiesMode === "enabled";
  const ports = services.length
    ? services.map((service) =>
        service === "be-insta" ? settings.backendPort : settings.frontendPort,
      )
    : [
        settings.backendPort,
        settings.frontendPort,
        settings.httpPort,
        settings.httpsPort,
      ];
  const requiredPorts =
    services.length && !services.includes("be-insta")
      ? ports
      : [...ports, settings.mailpitPort];
  const startupPorts = storiesEnabled
    ? [...requiredPorts, hostDefaults.storiesPort]
    : requiredPorts;
  for (const port of startupPorts)
    await assertPortAvailable({ port, containers });
  if (!services.length)
    await assertUdpPortAvailable({ port: settings.httpsPort, containers });
  requireSuccess(
    await processes.run({
      args: [process.execPath, "scripts/infra/prepare.ts"],
    }),
  );
  const { compose: storiesEnvironment } = await readStartupEnvironment(
    settings,
    storiesMode,
  );
  const environment = {
    [environmentKeys.webOrigin]: readComposeOrigin(settings.httpsPort),
    ...storiesEnvironment,
  };
  if (storiesEnabled) {
    const storiesCompose = createCompose({
      processes,
      profiles: ["stories"],
      environment,
    });
    requireSuccess(await storiesCompose.up(["rustfs"]));
    await initializeStoriesStorage({ compose: storiesCompose, build: true });
  }
  const compose = createCompose({ processes, environment });
  if (!services.length || services.includes("be-insta"))
    await startDeliveryInfrastructure({ compose, build: true });
  return compose.up(services.length ? services : defaultApplicationServices);
};
