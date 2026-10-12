import { inspectProject } from "../host/containers";
import { withStartupLock } from "../host/lock";
import { assertProjectOwnership } from "../host/preflight";
import { startHost } from "../host/start";
import { startLocalFrontend } from "../host/start-frontend";
import { createCompose } from "./compose";
import { appDirectories } from "./conts";
import type { OwnedProcesses } from "./processes";
import { startCompose } from "./start-compose";
import type { InfrastructureCommand } from "./types";

/** Выбирает сценарий инфраструктуры по закрытому command-контракту. Изменения Compose сериализует startup lock; для host-приложений возвращает первый завершившийся процесс, а общий cleanup остаётся владельцу processes. */
export const executeCommand = async ({
  command,
  processes,
  signal,
}: {
  readonly command: InfrastructureCommand;
  readonly processes: OwnedProcesses;
  readonly signal: AbortSignal;
}): Promise<number> => {
  switch (command.kind) {
    case "prepare":
      return processes.run({
        args: [process.execPath, "scripts/infra/prepare.ts"],
      });
    case "build":
      return processes.run({
        args: [
          process.execPath,
          "run",
          "--cwd",
          appDirectories[command.app],
          "build",
        ],
      });
    case "down":
      return withStartupLock({
        signal,
        /** Под startup lock проверяет принадлежность контейнеров перед Compose down; удаление volumes не запрашивает. */
        run: async () => {
          assertProjectOwnership(await inspectProject(processes));
          return createCompose({ processes }).run(["down"]);
        },
      });
    case "infrastructure":
    case "dev": {
      const exits = await withStartupLock({
        signal,
        /** Под startup lock выбирает отдельный frontend либо общий host-start и передаёт наружу promises завершения приложений. */
        run: () =>
          command.kind === "dev" &&
          command.apps.length === 1 &&
          command.apps[0] === "frontend"
            ? startLocalFrontend({ processes, signal })
            : startHost({
                apps: command.kind === "dev" ? command.apps : [],
                processes,
                signal,
              }),
      });
      return exits.length ? Promise.race(exits) : 0;
    }
    case "compose":
      return withStartupLock({
        signal,
        /** Под startup lock передаёт запуск выбранных контейнерных сервисов владельцу Compose preflight. */
        run: () => startCompose({ processes, services: command.services }),
      });
    default: {
      const unhandled: never = command;
      return unhandled;
    }
  }
};
