import { chmod, open } from "node:fs/promises";
import { artifactPermissions, phaseDeadlineMs } from "../conts";
import type { CommandResult } from "./types";
export const executeCommand = async ({
  command,
  directory,
  name,
  environment,
}: {
  readonly command: readonly string[];
  readonly directory: string;
  readonly name: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
}): Promise<CommandResult> => {
  const evidence = `${directory}/${name}.log`;
  const output = await open(evidence, "w", artifactPermissions.file);
  try {
    await chmod(evidence, artifactPermissions.file);
    await output.write(`${JSON.stringify({ command, startedAt: new Date().toISOString() })}
`);
    const child = Bun.spawn([...command], {
      cwd: new URL("../../../", import.meta.url).pathname,
      env: environment,
      stdout: output.fd,
      stderr: output.fd,
      timeout: phaseDeadlineMs,
    });
    const code = await child.exited;
    await output.write(`${JSON.stringify({ code, finishedAt: new Date().toISOString() })}
`);
    return { code, evidence };
  } finally {
    await output.close();
  }
};
