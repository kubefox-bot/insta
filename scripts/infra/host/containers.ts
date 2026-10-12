import { z } from "zod";
import type { OwnedProcesses } from "../commands/processes";
import { readInfraConfig } from "../config";
import { validateLocalFrontendStoriesMode } from "./config";
import { dockerFields, storiesModeInspectTemplate } from "./conts";
import type { ContainerState } from "./types";

export const containerSchema = z.array(
  z.object({
    [dockerFields.id]: z.string(),
    [dockerFields.config]: z.object({
      [dockerFields.image]: z.string(),
      [dockerFields.labels]: z.record(z.string(), z.string()).nullable(),
    }),
    [dockerFields.state]: z.object({
      [dockerFields.running]: z.boolean(),
      [dockerFields.status]: z.string(),
      [dockerFields.exitCode]: z.number(),
      [dockerFields.startedAt]: z.string(),
      [dockerFields.finishedAt]: z.string(),
      [dockerFields.health]: z
        .object({ [dockerFields.status]: z.string() })
        .optional(),
    }),
    [dockerFields.networkSettings]: z.object({
      [dockerFields.ports]: z.record(
        z.string(),
        z
          .array(
            z.object({
              [dockerFields.hostIp]: z.string(),
              [dockerFields.hostPort]: z.string(),
            }),
          )
          .nullable(),
      ),
      [dockerFields.networks]: z.record(
        z.string(),
        z.object({
          [dockerFields.aliases]: z.array(z.string()).nullish(),
        }),
      ),
    }),
  }),
);

/** Находит все контейнеры выбранного Compose project и проверяет форму Docker inspect. Пустой список означает отсутствие контейнеров; ошибки Docker/JSON/schema не превращаются в отсутствие. */
export const inspectProject = async (processes: OwnedProcesses) => {
  const config = readInfraConfig();
  const prefix = ["docker", "--host", config.endpoint];
  const ids = await processes.capture({
    args: [
      ...prefix,
      "ps",
      "--all",
      "--quiet",
      "--filter",
      `label=com.docker.compose.project=${config.project}`,
    ],
  });
  if (!ids) return [];
  return containerSchema.parse(
    JSON.parse(
      await processes.capture({
        args: [...prefix, "inspect", ...ids.split(/\s+/)],
      }),
    ),
  );
};
/** Возвращает первый контейнер с нужной Compose service label либо undefined; running/health не проверяет. */
export const findService = (
  containers: readonly ContainerState[],
  service: string,
) =>
  containers.find(
    (container) =>
      container.Config.Labels?.["com.docker.compose.service"] === service,
  );

/** Строит Docker inspect argv с узким template режима Stories вместо вывода всего container environment; команду не выполняет. */
export const buildStoriesModeInspectArgs = ({
  dockerHost,
  containerId,
}: {
  readonly dockerHost: string;
  readonly containerId: string;
}) => [
  "docker",
  "--host",
  dockerHost,
  "inspect",
  "--format",
  storiesModeInspectTemplate,
  containerId,
];

/** Читает узкую проекцию Stories mode указанного backend-контейнера и валидирует её перед передачей локальному frontend. */
export const readBackendStoriesMode = async ({
  processes,
  containerId,
}: {
  readonly processes: Pick<OwnedProcesses, "capture">;
  readonly containerId: string;
}) => {
  const { endpoint } = readInfraConfig();
  const rawMode = await processes.capture({
    args: buildStoriesModeInspectArgs({ dockerHost: endpoint, containerId }),
  });
  return validateLocalFrontendStoriesMode(rawMode);
};
/** Проверяет успешное завершение init не раньше текущего старта здорового running dependency; исторический успешный init предыдущего процесса не считается достаточным. */
export const initializedForProcess = ({
  containers,
  service,
  dependency,
}: {
  readonly containers: readonly ContainerState[];
  readonly service: string;
  readonly dependency: string;
}) => {
  const init = findService(containers, service);
  const server = findService(containers, dependency);
  return (
    !!init &&
    !!server &&
    init.State.Status === "exited" &&
    init.State.ExitCode === 0 &&
    server.State.Running &&
    server.State.Health?.Status === "healthy" &&
    Date.parse(init.State.FinishedAt) >= Date.parse(server.State.StartedAt)
  );
};
