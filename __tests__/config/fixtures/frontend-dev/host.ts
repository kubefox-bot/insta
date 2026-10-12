import { resolve } from "node:path";
import { OwnedProcesses } from "../../../../scripts/infra/commands/processes";
import { assertPortAvailable } from "../../../../scripts/infra/host/preflight";
import { waitUntil } from "../../../../scripts/infra/readiness";
import {
  readProcessEnvironment,
  readSyntheticWebConfiguration,
} from "../frontend-liveness/config";

export const withFrontendDev = async (
  run: (url: string) => Promise<void>,
  configuration: Readonly<Record<string, string>> = {},
) => {
  const reservation = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(),
  });
  const port = reservation.port;
  await reservation.stop(true);
  if (!port) throw new Error("Vite test did not reserve a TCP port");
  const url = `http://127.0.0.1:${port}`;
  const controller = new AbortController();
  const processes = new OwnedProcesses(controller.signal);
  const exit = processes.run({
    args: [
      process.execPath,
      "--no-env-file",
      "./node_modules/vite/bin/vite.js",
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    cwd: resolve(import.meta.dir, "../../../../apps/fe-insta"),
    env: readProcessEnvironment({
      ...readSyntheticWebConfiguration(),
      ...configuration,
    }),
    quiet: false,
  });
  try {
    await Promise.race([
      waitUntil({
        check: () =>
          fetch(url).then(
            () => true,
            () => false,
          ),
        timeoutMs: 20000,
      }),
      exit.then((code) => {
        throw new Error(`Vite exited before readiness: ${code}`);
      }),
    ]);
    await run(url);
  } finally {
    await processes.close();
    await exit;
    await assertPortAvailable({ port });
  }
};
