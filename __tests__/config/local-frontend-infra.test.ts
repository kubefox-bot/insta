import { expect, test } from "bun:test";
import {
  deriveLocalFrontendEnvironment,
  readLocalViteHMRPort,
  readLocalVitePort,
  validateHostSettings,
  validateLocalFrontendStoriesMode,
} from "../../scripts/infra/host/config";
import { buildStoriesModeInspectArgs } from "../../scripts/infra/host/containers";
import { dockerFields, environmentKeys } from "../../scripts/infra/host/conts";
import {
  buildTcpRelayArgs,
  selectFrontendRelayTarget,
} from "../../scripts/infra/host/tcp-relay";

const credentials = {
  [environmentKeys.mongoRootPassword]: "root-secret",
  [environmentKeys.apiMongoPassword]: "api-secret",
  [environmentKeys.webMongoPassword]: "web-secret",
  [environmentKeys.deliveryBrokerPassword]: "delivery/@:secret",
  [environmentKeys.brokerPassword]: "broker-secret",
  [environmentKeys.authSigningKey]: "a".repeat(64),
  [environmentKeys.sessionEncryptionKey]: "b".repeat(64),
  [environmentKeys.bffSourceSigningKey]: "c".repeat(64),
  [environmentKeys.storiesMode]: "enabled",
  [environmentKeys.storiesActiveProfile]: "local-v1",
  [environmentKeys.storiesStorageProfiles]: JSON.stringify([
    {
      id: "local-v1",
      endpoint: "http://rustfs:9000",
      playbackEndpoint: "https://localhost",
      bucket: "stories",
      region: "us-east-1",
      prefix: "stories/",
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
    },
  ]),
};

const container = ({
  service,
  image = `${service}:configured`,
  aliases,
  running = true,
}: {
  readonly service: string;
  readonly image?: string;
  readonly aliases: readonly string[];
  readonly running?: boolean;
}) => ({
  [dockerFields.id]: service,
  [dockerFields.config]: {
    [dockerFields.image]: image,
    [dockerFields.labels]: { "com.docker.compose.service": service },
  },
  [dockerFields.state]: {
    [dockerFields.running]: running,
    [dockerFields.status]: running ? "running" : "exited",
    [dockerFields.exitCode]: 0,
    [dockerFields.startedAt]: "2026-10-11T00:00:00Z",
    [dockerFields.finishedAt]: "",
    [dockerFields.health]: { [dockerFields.status]: "healthy" },
  },
  [dockerFields.networkSettings]: {
    [dockerFields.ports]: {},
    [dockerFields.networks]: {
      "generated-compose-network": {
        [dockerFields.aliases]: [...aliases],
      },
    },
  },
});

const services = [
  container({ service: "fe-insta", aliases: ["frontend"], running: false }),
  container({ service: "be-insta", aliases: ["backend"] }),
  container({ service: "mongo", aliases: ["mongo"] }),
  container({ service: "dragonfly", aliases: ["dragonfly"] }),
];

test("frontend relay target uses the configured frontend image and shared live network", () => {
  expect(selectFrontendRelayTarget({ containers: services })).toEqual({
    image: "fe-insta:configured",
    network: "generated-compose-network",
  });
});

test("frontend relays require Mongo, Dragonfly, backend and frontend metadata", () => {
  expect(() => selectFrontendRelayTarget({ containers: [] })).toThrow(
    "fe-insta metadata and running be-insta, mongo, and dragonfly containers",
  );
  expect(() =>
    selectFrontendRelayTarget({
      containers: services.filter(
        (value) =>
          value[dockerFields.config][dockerFields.labels]?.[
            "com.docker.compose.service"
          ] !== "dragonfly",
      ),
    }),
  ).toThrow(
    "fe-insta metadata and running be-insta, mongo, and dragonfly containers",
  );
});

test("frontend relay binds to loopback using discovered image and network", () => {
  expect(
    buildTcpRelayArgs({
      dockerHost: "unix:///tmp/docker.sock",
      image: "local/frontend:current",
      network: "generated-network",
      name: "fe-dev-mongo-relay-unique",
      hostPort: 27018,
      containerPort: 27017,
      service: "mongo",
      relayFile: "/workspace/scripts/infra/host/tcp-relay-server.ts",
    }),
  ).toEqual([
    "docker",
    "--host",
    "unix:///tmp/docker.sock",
    "run",
    "--rm",
    "--sig-proxy=true",
    "--pull=never",
    "--name",
    "fe-dev-mongo-relay-unique",
    "--network",
    "generated-network",
    "--publish",
    "127.0.0.1:27018:27017",
    "--volume",
    "/workspace/scripts/infra/host/tcp-relay-server.ts:/tmp/insta-tcp-relay.ts:ro",
    "--entrypoint",
    "bun",
    "local/frontend:current",
    "/tmp/insta-tcp-relay.ts",
    "mongo",
    "27017",
    "27017",
  ]);
});

test("local Vite config keeps its browser origin separate from Docker backend realtime origin", () => {
  const settings = validateHostSettings({
    [environmentKeys.hostMongoPort]: "27018",
    [environmentKeys.hostBrokerPort]: "16379",
  });
  const environment = deriveLocalFrontendEnvironment({
    settings,
    credentials,
    vitePort: 5173,
    viteHMRPort: 5174,
    storiesMode: "enabled",
  });
  expect(environment.WEB_MONGO_URL).toContain("127.0.0.1:27018");
  expect(environment.DRAGONFLY_URL).toContain("127.0.0.1:16379");
  expect(environment.ORIGIN).toBe("https://localhost:5173");
  expect(environment.INSTA_HOST_DEV_ORIGIN).toBe("https://localhost:5173");
  expect(environment.INSTA_LOCAL_FRONTEND).toBe("1");
  expect(environment.INSTA_LOCAL_HMR_PORT).toBe("5174");
  expect(environment.INSTA_LOCAL_REALTIME_ORIGIN).toBe("https://localhost");
  expect(environment.API_BASE_URL).toBe("http://127.0.0.1:3001");
  expect(environment.STORIES_MODE).toBe("enabled");
});

test("local frontend validates and preserves the Docker backend Stories mode", () => {
  expect(validateLocalFrontendStoriesMode("STORIES_MODE=enabled\n")).toBe(
    "enabled",
  );
  expect(validateLocalFrontendStoriesMode("STORIES_MODE=disabled\n")).toBe(
    "disabled",
  );
  expect(() =>
    validateLocalFrontendStoriesMode("STORIES_MODE=secret-profile\n"),
  ).toThrow("Invalid Docker backend Stories mode");
  expect(() => validateLocalFrontendStoriesMode("")).toThrow(
    "Invalid Docker backend Stories mode",
  );
  expect(() =>
    validateLocalFrontendStoriesMode(
      "STORIES_MODE=enabled\nAPI_MONGO_URL=mongodb://secret",
    ),
  ).toThrow("Invalid Docker backend Stories mode");
});

test("backend Stories mode inspect selects only the public mode field", () => {
  expect(
    buildStoriesModeInspectArgs({
      dockerHost: "unix:///tmp/docker.sock",
      containerId: "container-id",
    }),
  ).toEqual([
    "docker",
    "--host",
    "unix:///tmp/docker.sock",
    "inspect",
    "--format",
    '{{range .Config.Env}}{{if eq (index (split . "=") 0) "STORIES_MODE"}}{{println .}}{{end}}{{end}}',
    "container-id",
  ]);
});

test("local Vite port is independent from the legacy FE_PORT host-proxy setting", () => {
  expect(
    readLocalVitePort({
      [environmentKeys.vitePort]: "5173",
      [environmentKeys.frontendPort]: "3000",
    }),
  ).toBe(5173);
  expect(() =>
    readLocalVitePort({ [environmentKeys.vitePort]: "not-a-port" }),
  ).toThrow("Invalid local Vite port");
});

test("local Vite HMR has its own validated port independent from page and proxy ports", () => {
  expect(
    readLocalViteHMRPort({
      [environmentKeys.viteHMRPort]: "5174",
      [environmentKeys.vitePort]: "5173",
      [environmentKeys.frontendPort]: "3000",
    }),
  ).toBe(5174);
  expect(readLocalViteHMRPort({})).toBe(5174);
  expect(() =>
    readLocalViteHMRPort({ [environmentKeys.viteHMRPort]: "not-a-port" }),
  ).toThrow("Invalid local Vite HMR port");
});
