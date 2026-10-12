import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HOOK_FILENAMES } from "./conts.ts";
import { executeGit } from "./git.ts";
import type { GeneratedHooks } from "./types.ts";

/** Генерирует тексты управляемых hooks в отдельном временном Git-репозитории из текущего lefthook.yml. Временный каталог удаляется в finally; hooks рабочей копии здесь не устанавливаются. */
export const generateHooks = (): GeneratedHooks => {
  const source = join(
    executeGit("rev-parse", "--show-toplevel"),
    "lefthook.yml",
  );
  const temporary = mkdtempSync(join(tmpdir(), "insta-lefthook-install-"));
  /** Запускает команду в принадлежащем генерации временном каталоге; при ошибке сообщает команду, код и stderr, прерывая генерацию. */
  const run = (...args: string[]): void => {
    const result = Bun.spawnSync(args, {
      cwd: temporary,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode !== 0)
      throw new Error(
        `${args[0]} завершился с кодом ${result.exitCode}: ${result.stderr.toString()}`,
      );
  };
  try {
    run("git", "init", "--template=");
    const generated = join(temporary, "generated-hooks");
    run("git", "config", "--local", "core.hooksPath", generated);
    copyFileSync(source, join(temporary, "lefthook.yml"));
    run("lefthook", "install", "--force");
    return {
      preCommit: readFileSync(
        join(generated, HOOK_FILENAMES.preCommit),
        "utf8",
      ),
      commitMessage: readFileSync(
        join(generated, HOOK_FILENAMES.commitMessage),
        "utf8",
      ),
    };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
};
