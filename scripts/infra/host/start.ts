import { resolve } from "node:path";
import { createCompose, requireSuccess } from "../commands/compose";
import type { OwnedProcesses } from "../commands/processes";
import type { HostApp } from "../commands/types";
import {
  deriveHostComposeEnvironment,
  readHostSettings,
  readHostStoriesMode,
  readStartupEnvironment,
} from "./config";
import { inspectProject } from "./containers";
import { environmentKeys, hostOverlay } from "./conts";
import { launchHostApps } from "./launch";
import {
  assertHostStartupPorts,
  assertMode,
  assertProjectOwnership,
} from "./preflight";
import { prepareHostProxy } from "./proxy";
import { startHostInfrastructure } from "./start-infrastructure";

/** После проверки владения, режима и портов готовит credentials и инфраструктуру. Для выбранных host-приложений подготавливает proxy и возвращает их exit promises; запуск без apps ограничивается инфраструктурой. Процессами и отменой владеет вызывающий сценарий. */
export const startHost = async ({
  apps,
  processes,
  signal,
}: {
  readonly apps: readonly HostApp[];
  readonly processes: OwnedProcesses;
  readonly signal: AbortSignal;
}) => {
  const settings = readHostSettings();
  const storiesMode = readHostStoriesMode();
  const storiesEnabled = storiesMode === "enabled";
  const { fingerprint, environment: hostEnvironment } =
    deriveHostComposeEnvironment({
      settings,
      proxyConfig: resolve("infra/traefik/dynamic.yml"),
    });
  const containers = await inspectProject(processes);
  assertProjectOwnership(containers);
  assertMode({ containers, mode: "host", fingerprint });
  await assertHostStartupPorts({ settings, apps, containers, storiesEnabled });
  requireSuccess(
    await processes.run({
      args: [process.execPath, "scripts/infra/prepare.ts"],
    }),
  );
  const { applications: appEnvironment, compose: storiesEnvironment } =
    await readStartupEnvironment(settings, storiesMode);
  const environment = { ...hostEnvironment, ...storiesEnvironment };
  await startHostInfrastructure({
    processes,
    environment,
    storiesEnabled,
  });
  if (!apps.length) return [];
  signal.throwIfAborted();
  const proxy = await prepareHostProxy(settings);
  requireSuccess(
    await createCompose({
      processes,
      overlay: hostOverlay,
      environment: {
        ...environment,
        [environmentKeys.proxyConfig]: resolve(proxy.dynamic),
        [environmentKeys.proxyStaticConfig]: resolve(proxy.static),
      },
    }).run(["up", "--detach", "--no-deps", "traefik"]),
  );
  return launchHostApps({
    apps,
    settings,
    environment: appEnvironment,
    processes,
    signal,
  });
};
