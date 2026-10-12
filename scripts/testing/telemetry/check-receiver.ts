import { z } from "zod";
import { readInfraConfig } from "../../infra/config";
import { docker } from "../../infra/docker";

const [mode, runId, image] = process.argv.slice(2);
if (
  !runId ||
  !/^insta-done02-[a-f0-9-]+$/.test(runId) ||
  !image ||
  !/^sha256:[a-f0-9]{64}$/.test(image)
)
  throw new Error("Invalid receiver identity");
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
if (mode === "available") {
  if (id)
    throw new Error(
      "Refusing optional profile while a receiver is already running",
    );
} else if (mode === "owned") {
  if (!id) throw new Error("Required receiver is not running");
  const actual = z
    .object({
      image: z.string(),
      user: z.string(),
      mounts: z.number().int(),
      owner: z.string(),
    })
    .parse(
      JSON.parse(
        await docker(
          "inspect",
          "--format",
          '{"image":{{json .Image}},"user":{{json .Config.User}},"mounts":{{len .Mounts}},"owner":{{json (index .Config.Labels "insta.testRunId")}}}',
          id,
        ),
      ),
    );
  if (
    actual.image !== image ||
    actual.user !== "bun" ||
    actual.mounts !== 0 ||
    actual.owner !== runId
  )
    throw new Error("Receiver actual ownership/image/user/mount mismatch");
  console.log(
    JSON.stringify({ boundary: "owned-optional-receiver", ...actual }),
  );
} else throw new Error("Expected available or owned receiver check");
