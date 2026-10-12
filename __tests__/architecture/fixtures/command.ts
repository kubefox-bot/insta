export const run = (cwd: string, args: readonly string[]) => {
  const result = Bun.spawnSync([process.execPath, ...args], {
    cwd,
    stderr: "pipe",
    stdout: "pipe",
    timeout: 60000,
  });
  return {
    exitCode: result.exitCode,
    output: result.stdout.toString() + result.stderr.toString(),
  };
};
