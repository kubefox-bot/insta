import { createConnection } from "node:net";
import { resolve } from "node:path";
import { appDirectories } from "../commands/conts";
import type { OwnedProcesses } from "../commands/processes";
import type { HostApp } from "../commands/types";
import { readHostAppEnvironment } from "../config";
import { waitUntil } from "../readiness";
import type { readHostEnvironment, readHostSettings } from "./config";
import { connectTimeoutMs, loopbackHost } from "./conts";

/** Проверяет только TCP-доступность loopback-порта с ограниченным временем соединения; ошибка/timeout дают false, это не проверка HTTP readiness. */
const portIsListening = (port: number) =>
  new Promise<boolean>((resolveResult) => {
    const socket = createConnection({ host: loopbackHost, port });
    /** Закрывает собственный probe socket и завершает promise результатом TCP-проверки. */
    const settle = (result: boolean) => {
      socket.destroy();
      resolveResult(result);
    };
    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
    socket.setTimeout(connectTimeoutMs, () => settle(false));
  });
/** Запускает выбранные BE/Vite процессы с подготовленным окружением и без автоматической загрузки .env. Ждёт открытия всех TCP-портов либо раннего exit; возвращает promises завершения, оставляя cleanup владельцу processes. */
export const launchHostApps = async ({
  apps,
  settings,
  environment,
  processes,
  signal,
  frontendListenPort,
}: {
  readonly apps: readonly HostApp[];
  readonly settings: ReturnType<typeof readHostSettings>;
  readonly environment: Readonly<
    Partial<Awaited<ReturnType<typeof readHostEnvironment>>>
  >;
  readonly processes: OwnedProcesses;
  readonly signal: AbortSignal;
  readonly frontendListenPort?: number;
}) => {
  const exits = apps.map((app) =>
    processes.run({
      args:
        app === "backend"
          ? [process.execPath, "--no-env-file", "--watch", "src/main.ts"]
          : [
              process.execPath,
              "--no-env-file",
              "./node_modules/vite/bin/vite.js",
              "dev",
              "--host",
              loopbackHost,
              "--port",
              String(frontendListenPort ?? settings.frontendPort),
              "--strictPort",
            ],
      cwd: resolve(appDirectories[app]),
      env: { ...readHostAppEnvironment(), ...environment[app] },
    }),
  );
  await Promise.race([
    Promise.all(
      apps.map((app) =>
        waitUntil({
          /** Проверяет TCP-порт соответствующего host-приложения на очередной итерации readiness barrier. */
          check: () =>
            portIsListening(
              app === "backend"
                ? settings.backendPort
                : (frontendListenPort ?? settings.frontendPort),
            ),
          signal,
        }),
      ),
    ),
    Promise.race(exits).then((code) => {
      throw new Error(`Dev application exited before listening (exit${code})`);
    }),
  ]);
  return exits;
};
