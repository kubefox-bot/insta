import { appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { dockerFields as hostFields } from "../../../../scripts/infra/host/conts";
import { dockerFields } from "../../../fixtures/browser-egress/conts";

const [hostFlag, socket, ...args] = process.argv.slice(2);
if (hostFlag !== "--host" || !socket?.startsWith("unix://"))
  throw new Error("Fixture socket required");
const directory = dirname(socket.slice("unix://".length));
const fixture = z
  .object({
    owner: z.string(),
    manifest: z.string(),
    project: z.string(),
    sink: z.url(),
    failSeed: z.boolean(),
    failCleanup: z.boolean(),
  })
  .parse(await Bun.file(`${directory}/fixture.json`).json());
await appendFile(`${directory}/commands.jsonl`, `${JSON.stringify(args)}\n`);
const container = {
  [hostFields.id]: "borrowed-fixture",
  [dockerFields.config]: {
    [hostFields.image]: "fixture/mongo:owned",
    [dockerFields.labels]: {
      "com.docker.compose.project.working_dir": fixture.owner,
      "com.docker.compose.service": "mongo",
    },
  },
  [dockerFields.state]: {
    [dockerFields.running]: true,
    [dockerFields.status]: "running",
    [dockerFields.exitCode]: 0,
    [hostFields.startedAt]: "2026-10-11T00:00:00Z",
    [hostFields.finishedAt]: "",
    [hostFields.health]: { [dockerFields.status]: "healthy" },
  },
  [dockerFields.networkSettings]: {
    [dockerFields.ports]: {},
    [hostFields.networks]: {},
  },
};
if (args[0] === "ps") console.log("borrowed-fixture");
else if (args[0] === "inspect") console.log(JSON.stringify([container]));
else if (args[0] === "image" && args[1] === "inspect")
  console.log(
    JSON.stringify({
      user: "bun",
      labels: {
        "insta.source-manifest": fixture.manifest,
        "insta.source-tree": "a".repeat(40),
      },
    }),
  );
else if (args[0] === "network" && args[1] === "inspect")
  console.log(
    JSON.stringify([
      {
        [dockerFields.labels]: {
          "com.docker.compose.project": fixture.project,
        },
        [dockerFields.ipam]: {
          [dockerFields.config]: [
            {
              [dockerFields.subnet]: "172.29.0.0/16",
              [dockerFields.gateway]: "172.29.0.1",
            },
          ],
        },
        [dockerFields.containers]: {},
      },
    ]),
  );
else if (args[0] === "compose" && args.includes("ps"))
  console.log(`fixture-${args.at(-1)}`);
else if (
  args[0] === "compose" &&
  args.includes("run") &&
  args.includes("__tests__/integration/docker/persistence.ts")
) {
  const mode = z.enum(["seed", "read", "cleanup"]).parse(args.at(-2));
  await fetch(fixture.sink, { method: "POST", body: mode });
  if (
    (mode === "seed" && fixture.failSeed) ||
    (mode === "cleanup" && fixture.failCleanup)
  )
    process.exit(mode === "seed" ? 7 : 9);
  console.log(
    JSON.stringify({ api: 1, web: 1, generation: `${"a".repeat(40)}:fixture` }),
  );
} else if (args[0] === "compose" && args.includes("stop")) process.exit(0);
else process.exit(8);
