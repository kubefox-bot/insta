import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import type { OwnedProcesses } from "../commands/processes";
import { waitUntil } from "../readiness";
import {
  readHostSettings,
  readLocalFrontendEnvironment,
  readLocalViteHMRPort,
  readLocalVitePort,
} from "./config";
import {
  findService,
  inspectProject,
  readBackendStoriesMode,
} from "./containers";
import {
  backendService,
  brokerContainerPort,
  brokerService,
  connectTimeoutMs,
  loopbackHost,
  mongoContainerPort,
  mongoService,
} from "./conts";
import { launchHostApps } from "./launch";
import { assertPortAvailable, assertProjectOwnership } from "./preflight";
import { selectFrontendRelayTarget, startTcpRelay } from "./tcp-relay";
import type { ContainerState } from "./types";

/** Проверяет TCP-доступность loopback relay с timeout соединения; ошибки дают false, прикладной протокол не проверяется. */
const isListening = (port: number) =>
  new Promise<boolean>((resolveResult) => {
    const socket = createConnection({ host: loopbackHost, port });
    /** Уничтожает принадлежащий probe socket и разрешает promise текущим результатом соединения. */
    const settle = (result: boolean) => {
      socket.destroy();
      resolveResult(result);
    };
    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
    socket.setTimeout(connectTimeoutMs, () => settle(false));
  });

/** Возвращает только running healthy backend из выбранных контейнеров; отсутствие или неготовность отклоняет до запуска локального frontend. */
const requireBackend = (containers: readonly ContainerState[]) => {
  const backend = findService(containers, backendService);
  if (!backend?.State.Running || backend.State.Health?.Status !== "healthy")
    throw new Error(
      "Local frontend requires a healthy running be-insta container",
    );
  return backend;
};

/** Для каждого relay ждёт TCP-порт либо отклоняет ожидание при раннем exit. Не хватает соответствующего exit promise — запуск считается неполным. */
const waitForRelays = async ({
  relays,
  relayExits,
  signal,
}: {
  readonly relays: readonly {
    readonly name: string;
    readonly hostPort: number;
  }[];
  readonly relayExits: readonly Promise<number>[];
  readonly signal: AbortSignal;
}) =>
  Promise.all(
    relays.map(({ hostPort, name }, index) => {
      const relayExit = relayExits[index];
      if (!relayExit) throw new Error("TCP relay startup is incomplete");
      return Promise.race([
        waitUntil({
          /** Проверяет TCP-доступность текущего relay для readiness polling. */
          check: () => isListening(hostPort),
          signal,
        }),
        relayExit.then((code) => {
          throw new Error(
            `Owned ${name} relay exited before listening (exit${code})`,
          );
        }),
      ]);
    }),
  );

/** Проверяет существующий backend, переносит его Stories mode, проверяет доступность Vite/HMR/relay-портов и запускает два принадлежащих сценарию relay. После их готовности запускает FE и возвращает все exit promises; cleanup выполняет processes. */
export const startLocalFrontend = async ({
  processes,
  signal,
}: {
  readonly processes: OwnedProcesses;
  readonly signal: AbortSignal;
}) => {
  const settings = readHostSettings();
  const vitePort = readLocalVitePort();
  const viteHMRPort = readLocalViteHMRPort();
  if (vitePort === viteHMRPort)
    throw new Error("Local Vite and HMR ports must be distinct");
  const containers = await inspectProject(processes);
  assertProjectOwnership(containers);
  const backend = requireBackend(containers);
  const storiesMode = await readBackendStoriesMode({
    processes,
    containerId: backend.Id,
  });
  const target = selectFrontendRelayTarget({ containers });

  await assertPortAvailable({ port: settings.mongoPort });
  await assertPortAvailable({ port: settings.brokerPort });
  await assertPortAvailable({ port: vitePort });
  await assertPortAvailable({ port: viteHMRPort });

  const environment = await readLocalFrontendEnvironment(
    settings,
    vitePort,
    viteHMRPort,
    storiesMode,
  );
  const relays = [
    {
      name: mongoService,
      hostPort: settings.mongoPort,
      containerPort: mongoContainerPort,
    },
    {
      name: brokerService,
      hostPort: settings.brokerPort,
      containerPort: brokerContainerPort,
    },
  ] as const;
  const relayExits = relays.map(({ name, hostPort, containerPort }) =>
    startTcpRelay({
      processes,
      ...target,
      name: `fe-dev-${name}-relay-${randomUUID()}`,
      hostPort,
      containerPort,
      service: name,
    }),
  );
  await waitForRelays({ relays, relayExits, signal });
  signal.throwIfAborted();

  const frontendExits = await launchHostApps({
    apps: ["frontend"],
    settings,
    environment: { frontend: environment },
    processes,
    signal,
    frontendListenPort: vitePort,
  });
  return [...relayExits, ...frontendExits];
};
