import {
  readCommandEnvironment,
  readComposeFiles,
  readInfraConfig,
} from "../config";
import { composeWaitTimeoutSeconds } from "../conts";
import type { OwnedProcesses } from "./processes";

/** Собирает команды одного локального Compose project с упорядоченными overlays и снимком окружения. Запуск и завершение дочерних процессов принадлежат переданному processes. */
export const createCompose = ({
  processes,
  overlay,
  profiles = [],
  environment = {},
}: {
  readonly processes: OwnedProcesses;
  readonly overlay?: string;
  readonly profiles?: readonly string[];
  readonly environment?: Readonly<Record<string, string>>;
}) => {
  const config = readInfraConfig();
  const env = { ...readCommandEnvironment(), ...environment };
  const files = [...readComposeFiles(), ...(overlay ? [overlay] : [])];
  const prefix = [
    "docker",
    "--host",
    config.endpoint,
    "compose",
    "--project-name",
    config.project,
    ...profiles.flatMap((profile) => ["--profile", profile]),
    ...files.flatMap((file) => ["--file", file]),
  ];
  return {
    /** Выполняет Compose с общим префиксом и возвращает exit code; ненулевой код сам по себе не преобразуется здесь в исключение. */
    run: (args: readonly string[]) =>
      processes.run({ args: [...prefix, ...args], env }),
    /** Захватывает stdout Compose через владельца процессов; его ошибки остаются rejection, полученный текст может содержать конфигурацию. */
    capture: (args: readonly string[]) =>
      processes.capture({ args: [...prefix, ...args], env }),
    /** Запускает выбранные сервисы с build и ограниченным ожиданием readiness; возвращает код Compose, не удаляет volumes. */
    up: (services: readonly string[]) =>
      processes.run({
        args: [
          ...prefix,
          "up",
          "--build",
          "--wait",
          "--wait-timeout",
          String(composeWaitTimeoutSeconds),
          ...services,
        ],
        env,
      }),
  };
};
/** Преобразует ненулевой код инфраструктурной команды в ошибку; успешный код не создаёт дополнительного результата. */
export const requireSuccess = (code: number) => {
  if (code !== 0)
    throw new Error(`Infrastructure command failed (exit${code})`);
};
