import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { artifactPermissions } from "../../../scripts/testing/conts";
import { docker } from "../docker";
import { dockerFields, egressPolicy } from "./conts";

const stateSchema = z.object({
  [dockerFields.image]: z.string(),
  [dockerFields.config]: z.object({
    [dockerFields.labels]: z.record(z.string(), z.string()),
  }),
  [dockerFields.state]: z.object({
    [dockerFields.running]: z.boolean(),
    [dockerFields.oomKilled]: z.boolean(),
    [dockerFields.exitCode]: z.number().int(),
    [dockerFields.status]: z.string(),
  }),
  [dockerFields.networkSettings]: z.object({
    [dockerFields.ports]: z.record(
      z.string(),
      z
        .array(
          z.object({
            [dockerFields.hostIp]: z.string(),
            [dockerFields.hostPort]: z.string(),
          }),
        )
        .nullable(),
    ),
  }),
});

export const captureEgressFailure = async ({
  runId,
  path,
  execute = docker,
}: Readonly<{
  runId: string;
  path: string;
  execute?: typeof docker;
}>) => {
  const [container] = z
    .array(stateSchema)
    .parse(JSON.parse(await execute("container", "inspect", runId)));
  if (!container || container.Config.Labels["insta.testRunId"] !== runId)
    throw new Error("Refusing diagnostics from foreign egress container");
  const readyLogged = (
    await execute(
      "logs",
      "--tail",
      String(egressPolicy.diagnosticTailLines),
      runId,
    )
  ).includes(egressPolicy.readyMarker);
  await mkdir(dirname(path), {
    recursive: true,
    mode: artifactPermissions.directory,
  });
  await chmod(dirname(path), artifactPermissions.directory);
  await writeFile(
    path,
    JSON.stringify({
      runId,
      capturedAt: new Date().toISOString(),
      image: container.Image,
      state: container.State,
      published: container.NetworkSettings.Ports[`${egressPolicy.port}/tcp`],
      readyLogged,
    }),
    { mode: artifactPermissions.file, flag: "wx" },
  );
};
