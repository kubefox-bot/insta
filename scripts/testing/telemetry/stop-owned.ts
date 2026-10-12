import { readInfraConfig } from "../../infra/config";
import { docker } from "../../infra/docker";
import { receiverStopTimeoutSeconds } from "./conts";

const runId = process.argv[2];
if (!runId || !/^insta-done02-[a-f0-9-]+$/.test(runId))
  throw new Error("Invalid receiver ownership");
const id = await docker(
  "compose",
  "--project-name",
  readInfraConfig().project,
  "--profile",
  "telemetry",
  "ps",
  "-q",
  "telemetry-receiver",
);
if (id) {
  const owner = await docker(
    "inspect",
    "--format",
    '{{index .Config.Labels "insta.testRunId"}}',
    id,
  );
  if (owner !== runId)
    throw new Error("Refusing stop of foreign telemetry receiver");
  await docker("stop", "--time", String(receiverStopTimeoutSeconds), id);
}
