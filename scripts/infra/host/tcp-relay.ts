import { resolve } from "node:path";
import type { OwnedProcesses } from "../commands/processes";
import { readInfraConfig } from "../config";
import { findService } from "./containers";
import {
  backendService,
  brokerService,
  frontendService,
  mongoService,
  tcpRelayScriptPath,
} from "./conts";
import type { ContainerState } from "./types";

/** Требует metadata frontend и здоровые running backend/Mongo/Dragonfly, затем выбирает ровно одну общую сеть с Mongo alias. Возвращает image reference frontend и сеть; сам image digest не проверяет. */
export const selectFrontendRelayTarget = ({
  containers,
}: {
  readonly containers: readonly ContainerState[];
}) => {
  const frontend = findService(containers, frontendService);
  const backend = findService(containers, backendService);
  const mongo = findService(containers, mongoService);
  const broker = findService(containers, brokerService);
  if (
    !frontend ||
    !backend?.State.Running ||
    backend.State.Health?.Status !== "healthy" ||
    !mongo?.State.Running ||
    mongo.State.Health?.Status !== "healthy" ||
    !broker?.State.Running ||
    broker.State.Health?.Status !== "healthy"
  )
    throw new Error(
      "Local frontend requires fe-insta metadata and running be-insta, mongo, and dragonfly containers",
    );

  const sharedNetworks = Object.entries(mongo.NetworkSettings.Networks)
    .filter(([, network]) => network.Aliases?.includes(mongoService))
    .map(([name]) => name)
    .filter(
      (name) =>
        Object.hasOwn(backend.NetworkSettings.Networks, name) &&
        Object.hasOwn(broker.NetworkSettings.Networks, name) &&
        (!Object.keys(frontend.NetworkSettings.Networks).length ||
          Object.hasOwn(frontend.NetworkSettings.Networks, name)),
    );
  if (sharedNetworks.length !== 1)
    throw new Error(
      "Local frontend requires exactly one shared Compose network for Mongo and Dragonfly relays",
    );
  return {
    image: frontend.Config.Image,
    network: sharedNetworks[0],
  };
};

/** Формирует argv временного relay-контейнера с loopback-публикацией, read-only скриптом, --rm и запретом pull. Имя, сеть и image предоставляет владелец сценария. */
export const buildTcpRelayArgs = ({
  dockerHost,
  image,
  network,
  name,
  hostPort,
  containerPort,
  service,
  relayFile,
}: {
  readonly dockerHost: string;
  readonly image: string;
  readonly network: string;
  readonly name: string;
  readonly hostPort: number;
  readonly containerPort: number;
  readonly service: string;
  readonly relayFile: string;
}) => [
  "docker",
  "--host",
  dockerHost,
  "run",
  "--rm",
  "--sig-proxy=true",
  "--pull=never",
  "--name",
  name,
  "--network",
  network,
  "--publish",
  `127.0.0.1:${hostPort}:${containerPort}`,
  "--volume",
  `${resolve(relayFile)}:${tcpRelayScriptPath}:ro`,
  "--entrypoint",
  "bun",
  image,
  tcpRelayScriptPath,
  service,
  String(containerPort),
  String(containerPort),
];

/** Регистрирует cleanup по переданному уникальному имени до запуска relay. При закрытии ищет точное имя и принудительно удаляет найденный контейнер без volumes; возвращает promise Docker-процесса. */
export const startTcpRelay = ({
  processes,
  image,
  network,
  name,
  hostPort,
  containerPort,
  service,
}: {
  readonly processes: OwnedProcesses;
  readonly image: string;
  readonly network: string;
  readonly name: string;
  readonly hostPort: number;
  readonly containerPort: number;
  readonly service: string;
}) => {
  const { endpoint } = readInfraConfig();
  const docker = ["docker", "--host", endpoint];
  processes.onClose(async () => {
    const listed = await processes.runCleanup({
      args: [
        ...docker,
        "container",
        "ls",
        "--all",
        "--quiet",
        "--filter",
        `name=^/${name}$`,
      ],
    });
    if (listed.code !== 0)
      throw new Error("Could not identify the owned local frontend relay");
    if (!listed.output) return;
    const removed = await processes.runCleanup({
      args: [
        ...docker,
        "container",
        "rm",
        "--force",
        ...listed.output.split(/\s+/),
      ],
    });
    if (removed.code !== 0)
      throw new Error("Could not remove the owned local frontend relay");
  });
  return processes.run({
    args: buildTcpRelayArgs({
      dockerHost: endpoint,
      image,
      network,
      name,
      hostPort,
      containerPort,
      service,
      relayFile: "scripts/infra/host/tcp-relay-server.ts",
    }),
  });
};
