import { unlink } from "node:fs/promises";
import { z } from "zod";
import { readInfraConfig } from "../../../scripts/infra/config";
import { readAuthFixtureConfig } from "../auth05/config";
import {
  currentSourceMounts,
  fixtureFetchTimeoutMs,
  fixturePort,
  fixtureReadinessTimeoutMs,
} from "../auth05/conts";
import { disposeAuthFixture } from "../auth05/dispose";
import { waitUntil } from "../barrier";
import { docker } from "../docker";
import { setupFailure } from "../lifecycle/setup-failure";
export const startChatFixture = async () => {
  const runId = `insta-chat05-${crypto.randomUUID()}`;
  const config = readAuthFixtureConfig();
  const overlay = `${config.sourceRoot}.infra/${runId}.json`;
  await Bun.write(
    overlay,
    JSON.stringify({
      services: {
        testhost: {
          ...(config.image ? { image: config.image } : {}),
          volumes: config.image
            ? []
            : currentSourceMounts.map(
                (path) => `${config.sourceRoot}${path}:/workspace/${path}:ro`,
              ),
        },
      },
    }),
  );
  let acquired = false;
  const dispose = () => disposeAuthFixture({ runId, execute: docker });
  try {
    await docker(
      "compose",
      "--project-name",
      readInfraConfig().project,
      "-f",
      `${config.sourceRoot}compose.yaml`,
      "-f",
      overlay,
      "run",
      "--pull",
      "never",
      "-d",
      "--no-deps",
      "--name",
      runId,
      "--label",
      `insta.testRunId=${runId}`,
      "-p",
      `127.0.0.1::${fixturePort}`,
      "testhost",
      "bun",
      "__tests__/fixtures/chat05/host.ts",
    );
    acquired = true;
    const port = (await docker("port", runId, `${fixturePort}/tcp`))
      .split(":")
      .at(-1);
    const url = `http://127.0.0.1:${port}`;
    await waitUntil({
      timeoutMs: fixtureReadinessTimeoutMs,
      check: () =>
        fetch(url, { signal: AbortSignal.timeout(fixtureFetchTimeoutMs) }).then(
          async (response) => {
            await response.body?.cancel();
            return response.ok;
          },
          () => false,
        ),
    });
    const account = z.object({
      email: z.email(),
      password: z.string(),
      id: z.string(),
      username: z.string(),
    });
    const accounts = z
      .object({ alice: account, bob: account, mallory: account })
      .parse(await (await fetch(url)).json());
    console.log(
      JSON.stringify({
        fixtureRunId: runId,
        owner: "chat05",
        image: config.image,
      }),
    );
    return {
      ...accounts,
      url,
      dispose,
    };
  } catch (error) {
    if (acquired) {
      try {
        await dispose();
      } catch (cleanup) {
        throw setupFailure({
          error,
          cleanupError: cleanup,
          message: "CHAT05 setup and cleanup failed",
        });
      }
    }
    throw error;
  } finally {
    await unlink(overlay);
  }
};
