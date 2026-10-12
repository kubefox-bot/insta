import type { ListRepositoryPathsOptions } from "./types";

/** Возвращает Git-пути без изменения Unicode, пробелов и разделителей внутри имени. */
export const listRepositoryPaths = ({
  cwd,
}: ListRepositoryPathsOptions): readonly string[] => {
  const result = Bun.spawnSync(
    ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd, stderr: "pipe", stdout: "pipe" },
  );
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().split("\0").filter(Boolean);
};
