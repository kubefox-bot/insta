import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HOOK_FILE_MODE, HOOK_FILENAMES } from "./conts.ts";
import { generateHooks } from "./generate.ts";
import { executeGit } from "./git.ts";
import { prepareTarget } from "./prepare.ts";

/** Генерирует и записывает hooks текущей worktree после проверки владения каталогом. При ошибке записи восстанавливает прежний hooksPath, но уже записанные файлы не откатывает; ошибки выходят вызывающему коду. */
export const installHooks = (): void => {
  const target = prepareTarget();
  const generated = generateHooks();
  mkdirSync(target.directory, { recursive: true });
  executeGit("config", "--worktree", "core.hooksPath", target.directory);
  try {
    for (const key of ["preCommit", "commitMessage"] as const) {
      const path = join(target.directory, HOOK_FILENAMES[key]);
      writeFileSync(path, generated[key], { mode: HOOK_FILE_MODE });
      chmodSync(path, HOOK_FILE_MODE);
    }
  } catch (error) {
    if (target.previous === undefined)
      executeGit("config", "--worktree", "--unset", "core.hooksPath");
    else executeGit("config", "--worktree", "core.hooksPath", target.previous);
    throw error;
  }
  process.stdout.write(
    `Hooks установлены только для текущей worktree: ${target.directory}\n`,
  );
};
