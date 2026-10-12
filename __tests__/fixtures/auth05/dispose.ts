import { cleanupResources } from "../../../scripts/testing/cleanup";
import { fixtureStopTimeoutSeconds } from "./conts";

export const disposeAuthFixture = async ({
  runId,
  execute,
}: Readonly<{
  runId: string;
  execute: (...args: string[]) => Promise<string>;
}>) => {
  const owner = await execute(
    "container",
    "inspect",
    "--format",
    '{{index .Config.Labels "insta.testRunId"}}',
    runId,
  );
  if (owner !== runId) throw new Error("Refusing stop of unowned auth fixture");
  const failures: unknown[] = [];
  try {
    await execute("stop", "--time", String(fixtureStopTimeoutSeconds), runId);
    const code = await execute(
      "inspect",
      "--format",
      "{{.State.ExitCode}}",
      runId,
    );
    if (code !== "0") throw new Error("Auth browser fixture cleanup failed");
  } catch (error) {
    failures.push(error);
  }
  try {
    await cleanupResources({
      testRunId: runId,
      resources: [{ kind: "container", id: runId }],
      execute,
    });
  } catch (error) {
    failures.push(error);
  }
  if (failures.length)
    throw new AggregateError(failures, "Auth fixture disposal incomplete");
};
