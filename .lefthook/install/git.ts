/** Выполняет Git синхронно и возвращает обрезанный stdout; ненулевой код превращает в исключение с диагностикой stderr. */
export const executeGit = (...args: string[]): string => {
  const result = Bun.spawnSync(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString().trim());
  return result.stdout.toString().trim();
};

/** Читает Git config: код 1 означает отсутствие значения, остальные ошибки сохраняются как исключения; успешное значение обрезается по краям. */
export const readGitConfig = (...args: string[]): string | undefined => {
  const result = Bun.spawnSync(["git", "config", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode === 1) return undefined;
  if (result.exitCode !== 0) throw new Error(result.stderr.toString().trim());
  return result.stdout.toString().trim();
};
