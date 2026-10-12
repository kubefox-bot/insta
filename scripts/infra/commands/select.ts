import { commands } from "./conts";
import type { InfrastructureCommand } from "./types";
/** Принимает только собственный ключ таблицы инфраструктурных команд; отсутствующее или неизвестное имя отклоняет до запуска эффектов. */
export const selectCommand = (
  command: string | undefined,
): InfrastructureCommand => {
  if (command && Object.hasOwn(commands, command))
    return commands[command as keyof typeof commands];
  throw new Error(
    "Unknown infrastructure command; use mise tasks for available commands",
  );
};
