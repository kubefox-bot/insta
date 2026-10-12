import { join, resolve } from "node:path";
import { MANAGED_HOOK_DIRECTORY } from "./conts.ts";
import { executeGit, readGitConfig } from "./git.ts";
import { activeHooks, assertOwnedTarget } from "./preserve.ts";
import type { HookTarget } from "./types.ts";

/** Проверяет наличие Lefthook, worktreeConfig и отсутствие чужих hooks/config перед установкой. Возвращает управляемый каталог и прежнее worktree-значение для отката; настройки не меняет. */
export const prepareTarget = (): HookTarget => {
  if (readGitConfig("--get", "extensions.worktreeConfig") !== "true")
    throw new Error(
      "Требуется extensions.worktreeConfig=true; включите настройку репозитория явно перед установкой.",
    );
  if (!Bun.which("lefthook"))
    throw new Error(
      "Lefthook отсутствует; выполните mise install перед установкой hooks.",
    );
  const directory = join(
    executeGit("rev-parse", "--absolute-git-dir"),
    MANAGED_HOOK_DIRECTORY,
  );
  const currentHooks = resolve(executeGit("rev-parse", "--git-path", "hooks"));
  const configured = readGitConfig("--get", "core.hooksPath");
  if (
    currentHooks !== directory &&
    (configured !== undefined || activeHooks(currentHooks).length > 0)
  )
    throw new Error(
      `Существующие hooks/config сохранены: ${currentHooks}. Установка остановлена.`,
    );
  assertOwnedTarget(directory);
  return {
    directory,
    previous: readGitConfig("--worktree", "--get", "core.hooksPath"),
  };
};
