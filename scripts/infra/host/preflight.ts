import { createSocket } from "node:dgram";
import { createServer } from "node:net";
import { resolve } from "node:path";
import {
  hostDefaults,
  hostMode,
  hostModeLabel,
  hostSettingsLabel,
  loopbackHost,
} from "./conts";
import { portProbeError, selectProbeHost } from "./port-probe";
import type { ContainerState } from "./types";

/** Проверяет фиксированные и выбранные host-dev порты; RustFS port резервируется только для enabled Stories. */
export const assertHostStartupPorts = async ({
  settings,
  apps,
  containers,
  storiesEnabled,
}: {
  readonly settings: {
    readonly mongoPort: number;
    readonly brokerPort: number;
    readonly smtpPort: number;
    readonly mailpitPort: number;
    readonly httpPort: number;
    readonly httpsPort: number;
    readonly backendPort: number;
    readonly frontendPort: number;
  };
  readonly apps: readonly ("backend" | "frontend")[];
  readonly containers: readonly ContainerState[];
  readonly storiesEnabled: boolean;
}) => {
  const requiredPorts = [
    settings.mongoPort,
    settings.brokerPort,
    settings.smtpPort,
    settings.mailpitPort,
    ...(storiesEnabled ? [hostDefaults.storiesPort] : []),
    ...(apps.length ? [settings.httpPort, settings.httpsPort] : []),
  ];
  for (const port of requiredPorts)
    await assertPortAvailable({ port, containers });
  if (apps.length)
    await assertUdpPortAvailable({ port: settings.httpsPort, containers });
  for (const app of apps)
    await assertPortAvailable({
      port: app === "backend" ? settings.backendPort : settings.frontendPort,
    });
};

/** Проверяет только running контейнеры на совместимость container/host mode и host fingerprint. При конфликте требует отдельный project либо явную остановку, не меняя существующие контейнеры. */
export const assertMode = ({
  containers,
  mode,
  fingerprint,
}: {
  readonly containers: readonly ContainerState[];
  readonly mode: "host" | "container";
  readonly fingerprint?: string;
}) => {
  for (const container of containers.filter((value) => value.State.Running)) {
    const labels = container.Config.Labels ?? {};
    const service = labels["com.docker.compose.service"];
    const existingHost = labels[hostModeLabel] === hostMode;
    if (mode === "container" && existingHost)
      throw new Error(
        "Selected Compose project is in host-dev mode; stop owned dev apps and run compose:down before changing mode",
      );
    if (
      mode === "host" &&
      (!existingHost || labels[hostSettingsLabel] !== fingerprint)
    )
      throw new Error(
        `Selected Compose project has conflicting ${service} mode or ports; use a separate COMPOSE_PROJECT_NAME or compose:down before changing mode`,
      );
  }
};
/** Считает уже опубликованный loopback TCP-порт переданного running контейнера допустимым; иначе пробует exclusive bind и закрывает свой server. Занятый порт не освобождает и чужой процесс не останавливает. */
export const assertPortAvailable = async ({
  port,
  containers = [],
}: {
  readonly port: number;
  readonly containers?: readonly ContainerState[];
}) => {
  if (
    containers.some(
      (container) =>
        container.State.Running &&
        Object.entries(container.NetworkSettings.Ports).some(
          ([protocol, bindings]) =>
            protocol.endsWith("/tcp") &&
            bindings?.some(
              (binding) =>
                Number(binding.HostPort) === port &&
                binding.HostIp === loopbackHost,
            ),
        ),
    )
  )
    return;
  const server = createServer((socket) => socket.destroy());
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", (error) =>
        reject(portProbeError({ port, protocol: "TCP", error })),
      );
      server.listen(
        {
          host: selectProbeHost({ port, platform: process.platform }),
          port,
          exclusive: true,
        },
        resolve,
      );
    });
  } finally {
    if (server.listening)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
  }
};

/** Требует, чтобы working_dir label каждого контейнера разрешался в текущую рабочую директорию; отсутствие или другой checkout останавливают сценарий без изменения данных. */
export const assertProjectOwnership = (
  containers: readonly ContainerState[],
) => {
  const workingDirectory = resolve(process.cwd());
  for (const container of containers) {
    const owner =
      container.Config.Labels?.["com.docker.compose.project.working_dir"];
    if (!owner || resolve(owner) !== workingDirectory)
      throw new Error(
        "Selected Compose project belongs to another checkout. Choose a separate COMPOSE_PROJECT_NAME; existing containers and data preserved.",
      );
  }
};
/** Разрешает UDP-порт переданного running контейнера с loopback binding; иначе выполняет exclusive IPv4 bind и закрывает свой socket. Ошибка не даёт разрешения останавливать существующий listener. */
export const assertUdpPortAvailable = async ({
  port,
  containers = [],
}: {
  readonly port: number;
  readonly containers?: readonly ContainerState[];
}) => {
  if (
    containers.some(
      (container) =>
        container.State.Running &&
        Object.entries(container.NetworkSettings.Ports).some(
          ([protocol, bindings]) =>
            protocol.endsWith("/udp") &&
            bindings?.some(
              (binding) =>
                Number(binding.HostPort) === port &&
                binding.HostIp === loopbackHost,
            ),
        ),
    )
  )
    return;
  const socket = createSocket("udp4");
  const listening = { value: false };
  try {
    await new Promise<void>((resolveReady, reject) => {
      socket.once("error", (error) =>
        reject(portProbeError({ port, protocol: "UDP", error })),
      );
      socket.bind(
        {
          address: selectProbeHost({ port, platform: process.platform }),
          port,
          exclusive: true,
        },
        () => {
          listening.value = true;
          resolveReady();
        },
      );
    });
  } finally {
    if (listening.value)
      await new Promise<void>((resolveClosed) => socket.close(resolveClosed));
  }
};
