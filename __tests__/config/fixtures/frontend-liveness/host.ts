import { resolve } from "node:path";
import { readProcessEnvironment } from "./config";

export const buildFrontend = async () => {
  const child = Bun.spawn([process.execPath, "--no-env-file", "run", "build"], {
    cwd: resolve(import.meta.dir, "../../../../apps/fe-insta"),
    env: readProcessEnvironment(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, output, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0) throw new Error(`Frontend build failed: ${output}\n${error}`);
};

export const startFrontend = async (
  configuration: Readonly<Record<string, string>>,
) => {
  const child = Bun.spawn(
    [process.execPath, "--no-env-file", "dist/index.js"],
    {
      cwd: resolve(import.meta.dir, "../../../../apps/fe-insta"),
      env: readProcessEnvironment({
        ...Object.fromEntries([
          ["HOST", "127.0.0.1"],
          ["PORT", "0"],
          ["SHUTDOWN_TIMEOUT", "1"],
        ]),
        ...configuration,
      }),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const stderr = new Response(child.stderr).text();
  const timeout = setTimeout(() => child.kill("SIGKILL"), 20000);
  const reader = child.stdout.getReader();
  const output = { text: "" };
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done)
        throw new Error(`Frontend did not listen: ${await stderr}`);
      output.text += new TextDecoder().decode(chunk.value);
      const url = output.text.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (!url) continue;
      const drain = (async () => {
        while (!(await reader.read()).done) {
          /* Own the child output stream. */
        }
      })();
      return {
        url,
        close: async () => {
          child.kill("SIGTERM");
          const code = await child.exited;
          clearTimeout(timeout);
          await drain;
          const error = await stderr;
          reader.releaseLock();
          if (code !== 0) throw new Error(`Frontend shutdown failed: ${error}`);
        },
      };
    }
  } catch (error) {
    child.kill("SIGKILL");
    await child.exited;
    clearTimeout(timeout);
    reader.releaseLock();
    await stderr;
    throw error;
  }
};
