import { expect, test } from "bun:test";
import { z } from "zod";
import { readStoriesConfig } from "../../apps/be-insta/src/lib/config";
import { createCompose } from "../../scripts/infra/commands/compose";
import { environmentKeys } from "../../scripts/infra/host/conts";

const serviceSchema = z
  .object({
    ports: z.array(z.string()).optional(),
    environment: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional(),
    healthcheck: z.object({ test: z.array(z.string()) }).optional(),
    profiles: z.array(z.string()).optional(),
  })
  .catchall(z.unknown());
const compose = z
  .object({ services: z.record(z.string(), serviceSchema) })
  .parse(Bun.YAML.parse(await Bun.file("compose.yaml").text()));
const service = (name: string) => {
  const found = compose.services[name];
  if (!found) throw new Error(`Missing Compose service: ${name}`);
  return found;
};
const dependencies = (name: string) =>
  z
    .record(z.string(), z.object({ condition: z.string() }))
    .parse(service(name).depends_on ?? {});

test("frontend starts after its persistence bootstrap without backend readiness", () => {
  expect(dependencies("fe-insta")).toEqual({
    "mongo-init": { condition: "service_completed_successfully" },
    "broker-init": { condition: "service_completed_successfully" },
  });
  expect(service("fe-insta").healthcheck?.test.at(-1)).toContain(
    "http://localhost:3000/api/health/live",
  );
});

test("backend retains bootstrap ordering and starts optional mail without healthy admission", () => {
  expect(dependencies("be-insta")).toEqual({
    "mongo-init": { condition: "service_completed_successfully" },
    "broker-init": { condition: "service_completed_successfully" },
    mailpit: { condition: "service_started" },
  });
  expect(service("be-insta").healthcheck?.test.at(-1)).toContain(
    "/health/ready",
  );
});

test("Stories storage stays profile-scoped so Core-only can omit its providers", () => {
  expect(dependencies("traefik")).toEqual({});
  for (const name of ["fe-insta", "be-insta"]) {
    expect(service(name).stop_grace_period).toBe("15s");
    expect(service(name).environment?.STORIES_MODE).toContain("enabled");
  }
  expect(service("rustfs").profiles).toEqual(["stories"]);
  expect(service("stories-init").profiles).toEqual(["stories"]);
  expect(dependencies("stories-init")).toEqual({
    rustfs: { condition: "service_healthy" },
  });
  const initEnvironment = service("stories-init").environment;
  expect(initEnvironment).toBeDefined();
  const profile = {
    id: "local-v1",
    endpoint: "http://rustfs:9000",
    playbackEndpoint: "https://localhost",
    bucket: "stories",
    region: "us-east-1",
    prefix: "stories/",
    accessKeyId: "access-key",
    secretAccessKey: "secret-key",
  };
  expect(
    readStoriesConfig({
      [environmentKeys.storiesMode]: String(initEnvironment?.STORIES_MODE),
      [environmentKeys.storiesActiveProfile]: profile.id,
      [environmentKeys.storiesStorageProfiles]: JSON.stringify([profile]),
    }).mode,
  ).toBe("enabled");
  expect(service("testhost").profiles).toEqual(["test"]);
});

test("Compose launcher activates the Stories profile only when requested", async () => {
  const commands: string[][] = [];
  const processes = {
    run: async ({ args }: { readonly args: readonly string[] }) => {
      commands.push([...args]);
      return 0;
    },
    capture: async () => "",
  };
  await createCompose({
    processes: processes as never,
    profiles: ["stories"],
  }).up(["rustfs"]);
  expect(commands[0]).toContain("--profile");
  expect(commands[0]).toContain("stories");
  expect(commands[0]).toContain("rustfs");
});

test("isolated app and proxy ports bind loopback; persistence stays internal", () => {
  expect(service("fe-insta").ports).toEqual([
    `127.0.0.1:\${FE_PORT:-3000}:3000`,
  ]);
  expect(service("be-insta").ports).toEqual([
    `127.0.0.1:\${BE_PORT:-3001}:3001`,
  ]);
  expect(service("traefik").ports).toEqual([
    `127.0.0.1:\${HTTP_PORT:-80}:80`,
    `127.0.0.1:\${HTTPS_PORT:-443}:443/tcp`,
    `127.0.0.1:\${HTTPS_PORT:-443}:443/udp`,
  ]);
  for (const name of ["mongo", "dragonfly", "rustfs"])
    expect(service(name).ports ?? []).toEqual([]);
  expect(service("fe-insta").environment?.API_BASE_URL).toBe(
    `\${API_BASE_URL:-http://be-insta:3001}`,
  );
});

test("delivery has independent bootstrap, persistence and measured headroom", () => {
  const delivery = service("dragonfly-delivery");
  expect(delivery.image).toBe(service("dragonfly").image);
  expect(delivery.command).toContain("--maxmemory=1gb");
  expect(delivery.mem_limit).toBe("1536m");
  expect(delivery.volumes).toEqual(["dragonfly-delivery-data:/data"]);
  expect(dependencies("delivery-broker-init")).toEqual({
    "dragonfly-delivery": { condition: "service_started" },
  });
  expect(service("delivery-broker-init").command).toContain(
    "infra/dragonfly/delivery-bootstrap.ts",
  );
  expect(service("be-insta").environment?.DELIVERY_DRAGONFLY_URL).toBe(
    service("testhost").environment?.DELIVERY_DRAGONFLY_URL,
  );
  expect(service("dragonfly").command).toContain("--maxmemory=256mb");
});
