import { unlink } from "node:fs/promises";
import { z } from "zod";
import { readInfraConfig } from "../../../scripts/infra/config";
import { readAuthFixtureConfig } from "../auth05/config";
import { disposeAuthFixture } from "../auth05/dispose";
import { docker } from "../docker";
import { setupFailure } from "../lifecycle/setup-failure";
import { allocateEgressAddress } from "./allocate";
import { dockerFields, egressPolicy } from "./conts";
import { waitForEgress } from "./ready";
import type { Egress } from "./types";
export const startBrowserEgress = async (): Promise<Egress> => {
  const runId = `insta-egress-${crypto.randomUUID()}`;
  const config = readAuthFixtureConfig();
  if (!config.image)
    throw new Error("Browser egress requires an exact prepared testhost image");
  const { address, network } = await allocateEgressAddress(runId);
  const overlay = `.infra/${runId}.json`;
  await Bun.write(
    overlay,
    JSON.stringify({
      services: {
        "browser-egress": {
          extends: {
            file: `${config.sourceRoot}compose.yaml`,
            service: "testhost",
          },
          image: config.image,
          user: "bun",
          [dockerFields.composeWorkingDirectory]: "/workspace",
          volumes: [],
          networks: { default: { [dockerFields.composeAddress]: address } },
          ports: [`127.0.0.1::${egressPolicy.port}`],
          [dockerFields.composeMemory]: egressPolicy.memoryLimit,
          cpus: egressPolicy.cpuLimit,
          command: ["bun", "__tests__/fixtures/browser-egress/host.ts"],
          labels: { "insta.testRunId": runId },
        },
      },
    }),
  );
  const verifyOwner = async () => {
    if (
      (await docker(
        "container",
        "inspect",
        "--format",
        '{{index .Config.Labels "insta.testRunId"}}',
        runId,
      )) !== runId
    )
      throw new Error("Refusing foreign browser egress container");
  };
  const dispose = () => disposeAuthFixture({ runId, execute: docker });
  try {
    await docker(
      "compose",
      "--project-name",
      readInfraConfig().project,
      "-f",
      "compose.yaml",
      "-f",
      overlay,
      "--profile",
      "test",
      "run",
      "--pull",
      "never",
      "--no-deps",
      "-d",
      "--service-ports",
      "--name",
      runId,
      "browser-egress",
    );
    await verifyOwner();
    const [state] = z
      .array(
        z.object({
          [dockerFields.image]: z.string(),
          [dockerFields.config]: z.object({
            [dockerFields.user]: z.string(),
            [dockerFields.workingDirectory]: z.string(),
          }),
          [dockerFields.mounts]: z.array(z.unknown()),
          [dockerFields.networkSettings]: z.object({
            [dockerFields.networks]: z.record(
              z.string(),
              z.object({ [dockerFields.ipAddress]: z.string() }),
            ),
          }),
        }),
      )
      .parse(JSON.parse(await docker("container", "inspect", runId)));
    if (
      !state ||
      state.Image !== config.image ||
      state.Config.User !== "bun" ||
      state.Config.WorkingDir !== "/workspace" ||
      state.Mounts.length ||
      state.NetworkSettings.Networks[network]?.IPAddress !== address
    )
      throw new Error("Browser egress immutable identity/address mismatch");
    const port = (await docker("port", runId, `${egressPolicy.port}/tcp`))
      .split(":")
      .at(-1);
    if (!port || !/^\d+$/.test(port))
      throw new Error("Missing loopback browser egress port");
    await waitForEgress({
      port: Number(port),
      readReady: async () =>
        (await docker("logs", runId)).includes(egressPolicy.readyMarker),
    });
    return {
      runId,
      address,
      server: `http://127.0.0.1:${port}`,
      dispose,
      observe: async (source = address) => {
        await verifyOwner();
        const result = JSON.parse(
          await docker(
            "exec",
            runId,
            "bun",
            "__tests__/fixtures/browser-egress/observe.ts",
            source,
          ),
        );
        return z.object({ count: z.number().int().nonnegative() }).parse(result)
          .count;
      },
    };
  } catch (error) {
    try {
      await dispose();
    } catch (cleanupError) {
      throw setupFailure({
        error,
        cleanupError,
        message: "Browser egress startup and cleanup failed",
      });
    }
    throw error;
  } finally {
    await unlink(overlay);
  }
};
