import { unlink } from "node:fs/promises";
import { z } from "zod";
import { readInfraConfig } from "../../../scripts/infra/config";
import { waitUntil } from "../barrier";
import { docker } from "../docker";
import { readAuthFixtureConfig } from "./config";
import {
  currentSourceMounts,
  fixtureFetchTimeoutMs,
  fixturePort,
  fixtureReadinessTimeoutMs,
} from "./conts";
import { disposeAuthFixture } from "./dispose";

const startupFailure = (error: unknown, cleanupError: unknown) =>
  new AggregateError(
    [error, cleanupError],
    "Auth fixture startup and cleanup failed",
    {
      cause: error,
    },
  );

export const startAuthFixture = async ({
  execute = docker,
  request = fetch,
  configuration,
  composeFiles = [],
  hostEntrypoint = "__tests__/fixtures/auth05/host.ts",
}: Readonly<{
  composeFiles?: readonly string[];
  configuration?: ReturnType<typeof readAuthFixtureConfig>;
  hostEntrypoint?:
    | "__tests__/fixtures/auth05/host.ts"
    | "__tests__/fixtures/bff-session/browser-host.ts"
    | "__tests__/fixtures/stories/host.ts";
  execute?: typeof docker;
  request?: (input: string, init?: RequestInit) => Promise<Response>;
}> = {}) => {
  const runId = `insta-auth05-${crypto.randomUUID()}`;
  const config = configuration ?? readAuthFixtureConfig();
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
  const dispose = () => disposeAuthFixture({ runId, execute });
  try {
    await execute(
      "compose",
      "--project-name",
      readInfraConfig().project,
      "-f",
      `${config.sourceRoot}compose.yaml`,
      ...composeFiles.flatMap((file) => ["-f", file]),
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
      hostEntrypoint,
    );
    const port = (await execute("port", runId, `${fixturePort}/tcp`))
      .split(":")
      .at(-1);
    const url = `http://127.0.0.1:${port}`;
    await waitUntil({
      timeoutMs: fixtureReadinessTimeoutMs,
      check: () =>
        request(url, {
          signal: AbortSignal.timeout(fixtureFetchTimeoutMs),
        }).then(
          async (response) => {
            await response.body?.cancel();
            return response.ok;
          },
          () => false,
        ),
    });
    const account = z.object({ email: z.email(), password: z.string() });
    const credentials = z
      .object({
        account,
        secondAccount: account,
        signupEmail: z.email(),
        noJsEmail: z.email(),
      })
      .parse(
        await (
          await request(url, {
            signal: AbortSignal.timeout(fixtureFetchTimeoutMs),
          })
        ).json(),
      );
    return {
      ...credentials,
      dispose,
      url,
      hostMailpitUrl: config.hostMailpitUrl,
    };
  } catch (error) {
    try {
      await dispose();
    } catch (cleanupError) {
      throw startupFailure(error, cleanupError);
    }
    throw error;
  } finally {
    await unlink(overlay);
  }
};
