import { testTimeoutMs } from "../conts";
import { capacityOwnerPath, capacityProfileNames } from "./conts";
/** Сохраняет общий deadline команды: четыре полных capacity профиля получают независимые budgets без implicit run-all. */
export const createHostProviderCommands = (paths: readonly string[]) => {
  const ordinary = paths.filter((path) => path !== capacityOwnerPath);
  const runner = [process.execPath, "test"];
  const timeout = ["--timeout", String(testTimeoutMs)];
  return [
    ...(ordinary.length
      ? [[...runner, ...ordinary.map((path) => `./${path}`), ...timeout]]
      : []),
    ...(paths.includes(capacityOwnerPath)
      ? capacityProfileNames.map((pattern) => [
          ...runner,
          `./${capacityOwnerPath}`,
          ...timeout,
          "--test-name-pattern",
          pattern,
        ])
      : []),
  ];
};
