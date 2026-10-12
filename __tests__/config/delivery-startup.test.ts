import { expect, spyOn, test } from "bun:test";
import { z } from "zod";
import { defaultApplicationServices } from "../../scripts/infra/commands/conts";
import { OwnedProcesses } from "../../scripts/infra/commands/processes";
import { startHostInfrastructure } from "../../scripts/infra/host/start-infrastructure";

test("host startup completes auth/Mongo initialization without waiting for unavailable delivery", async () => {
  const processes = new OwnedProcesses(new AbortController().signal);
  const observed: string[][] = [];
  const run = spyOn(processes, "run").mockImplementation(async ({ args }) => {
    observed.push([...args]);
    if (args.includes("--wait") && args.includes("dragonfly-delivery"))
      throw new Error("Synthetic delivery unavailable");
    return 0;
  });
  const capture = spyOn(processes, "capture").mockImplementation(
    async ({ args }) => {
      observed.push([...args]);
      if (
        args.includes("--abort-on-container-exit") &&
        args.includes("delivery-broker-init")
      )
        throw new Error("Synthetic delivery bootstrap retrying");
      return "";
    },
  );
  try {
    await startHostInfrastructure({
      processes,
      environment: {},
      storiesEnabled: false,
    });
    expect(
      observed.some(
        (args) =>
          args.includes("--wait") &&
          args.includes("mongo") &&
          args.includes("dragonfly"),
      ),
    ).toBe(true);
    expect(
      observed.some(
        (args) =>
          args.includes("delivery-broker-init") &&
          args.includes("--detach") &&
          !args.includes("--wait"),
      ),
    ).toBe(true);
  } finally {
    run.mockRestore();
    capture.mockRestore();
    await processes.close();
  }
});

test("ordinary app dependency graph excludes optional delivery while infrastructure owns failed bootstrap retries", async () => {
  const compose = z
    .object({
      services: z.record(
        z.string(),
        z.object({
          ["depends_on"]: z
            .record(z.string(), z.object({ condition: z.string() }))
            .optional(),
          restart: z.string().optional(),
        }),
      ),
    })
    .parse(Bun.YAML.parse(await Bun.file("compose.yaml").text()));
  const service = (name: string) => {
    const found = compose.services[name];
    if (!found) throw new Error(`Missing service ${name}`);
    return found;
  };
  expect(
    service("be-insta").depends_on?.["delivery-broker-init"],
  ).toBeUndefined();
  expect(service("be-insta").depends_on?.["broker-init"]?.condition).toBe(
    "service_completed_successfully",
  );
  expect(
    service("delivery-broker-init").depends_on?.["dragonfly-delivery"]
      ?.condition,
  ).toBe("service_started");
  expect(service("delivery-broker-init").restart).toBe("on-failure");
  const pending: string[] = [...defaultApplicationServices];
  const visited = new Set<string>();
  while (pending.length) {
    const name = pending.pop();
    if (!name || visited.has(name)) continue;
    visited.add(name);
    pending.push(...Object.keys(service(name).depends_on ?? {}));
  }
  expect(visited.has("dragonfly-delivery")).toBe(false);
  expect(visited.has("delivery-broker-init")).toBe(false);
});
