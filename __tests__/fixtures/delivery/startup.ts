import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { OwnedProcesses } from "../../../scripts/infra/commands/processes";
import { cleanupResources } from "../../../scripts/testing/cleanup";
import type { OwnedResource } from "../../../scripts/testing/types";
import { docker } from "../docker";
import { prepareStartupWorkspace } from "./startup/prepare";

/** Готовит отдельный workspace/project для настоящего compose:backend launcher; все секреты, Mongo/volumes и fault controls принадлежат run. */
export const withOrdinaryDeliveryStartup = async (
  run: (
    fixture: Readonly<{
      launch: () => Promise<void>;
      control: () => Promise<string>;
      backend: () => Promise<string>;
      serviceId: (service: string) => Promise<string>;
      restoreProvider: () => Promise<void>;
    }>,
  ) => Promise<void>,
) => {
  const project = `insta-chat03-${crypto.randomUUID()}`;
  const root = resolve(".");
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "insta-delivery-startup-")),
  );
  const abort = new AbortController();
  const processes = new OwnedProcesses(abort.signal);
  const serviceId = async (service: string) =>
    await docker(
      "ps",
      "--all",
      "--quiet",
      "--filter",
      `label=com.docker.compose.project=${project}`,
      "--filter",
      `label=com.docker.compose.service=${service}`,
    );
  try {
    const { environment, port } = await prepareStartupWorkspace({
      root,
      directory,
      project,
    });
    const launch = async () => {
      const code = await processes.run({
        args: [
          process.execPath,
          "--no-env-file",
          join(root, "scripts/infra/run.ts"),
          "compose:backend",
        ],
        cwd: directory,
        env: environment,
      });
      if (code !== 0) throw new Error(`Ordinary launcher exit ${code}`);
      const owner = await docker(
        "inspect",
        "--format",
        '{{index .Config.Labels "com.docker.compose.project.working_dir"}}',
        await serviceId("be-insta"),
      );
      if (owner !== directory)
        throw new Error("Fixture checkout identity mismatch");
    };
    await run({
      launch,
      serviceId,
      backend: async () => `http://127.0.0.1:${port}`,
      control: async () =>
        `http://127.0.0.1:${(await docker("port", await serviceId("be-insta"), "3002/tcp")).split(":").at(-1)}`,
      restoreProvider: async () => {
        await docker(
          "exec",
          "-d",
          await serviceId("dragonfly-delivery"),
          "/usr/local/bin/dragonfly",
          "--proactor_threads=1",
          "--maxmemory=1gb",
          "--requirepass=synthetic-delivery",
          "--dir=/data",
          "--dbfilename=snapshot",
          "--logtostderr",
        );
      },
    });
  } finally {
    abort.abort();
    await processes.close();
    const api = await serviceId("be-insta");
    if (api) await docker("stop", "--time", "15", api);
    const resources: OwnedResource[] = [];
    for (const kind of ["volume", "network", "container"] as const) {
      const args =
        kind === "container"
          ? ["ps", "--all", "--quiet"]
          : [kind, "ls", "--quiet"];
      const ids = await docker(
        ...args,
        "--filter",
        `label=insta.testRunId=${project}`,
      );
      for (const id of ids.split(/\s+/).filter(Boolean))
        resources.push({ kind, id });
    }
    await cleanupResources({ testRunId: project, resources, execute: docker });
    await rm(directory, { recursive: true, force: true });
  }
};
