import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  deriveHostEnvironment,
  deriveStartupEnvironment,
  validateHostSettings,
} from "../../scripts/infra/host/config";
import { environmentKeys, hostDefaults } from "../../scripts/infra/host/conts";

const inheritedWebOrigin = Bun.env[environmentKeys.webOrigin];
beforeEach(() => {
  delete Bun.env[environmentKeys.webOrigin];
});
afterEach(() => {
  if (inheritedWebOrigin === undefined)
    delete Bun.env[environmentKeys.webOrigin];
  else Bun.env[environmentKeys.webOrigin] = inheritedWebOrigin;
});

const credentials = {
  [environmentKeys.mongoRootPassword]: "root-secret",
  [environmentKeys.apiMongoPassword]: "api/@:secret",
  [environmentKeys.webMongoPassword]: "web/@:secret",
  [environmentKeys.deliveryBrokerPassword]: "delivery/@:secret",
  [environmentKeys.brokerPassword]: "broker/@:secret",
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
test("host config derives owned credentials and single-member transaction URI", () => {
  const settings = validateHostSettings({
    [environmentKeys.httpsPort]: "24443",
    [environmentKeys.backendPort]: "23001",
    [environmentKeys.frontendPort]: "23000",
  });
  const env = deriveHostEnvironment({ settings, credentials });
  const api = new URL(env.backend.API_MONGO_URL);
  const web = new URL(env.frontend.WEB_MONGO_URL);
  expect(decodeURIComponent(api.password)).toBe(credentials.API_MONGO_PASSWORD);
  expect(decodeURIComponent(web.password)).toBe(credentials.WEB_MONGO_PASSWORD);
  expect(api.hostname).toBe("127.0.0.1");
  expect(api.searchParams.get("replicaSet")).toBe("rs0");
  expect(api.searchParams.get("directConnection")).toBe("true");
  expect(web.searchParams.get("authSource")).toBe("insta_web");
  expect(env.frontend.API_BASE_URL).toBe("http://127.0.0.1:23001");
  expect(env.frontend.ORIGIN).toBe("https://localhost:24443");
  expect(env.backend.REALTIME_ORIGIN).toBe(env.frontend.ORIGIN);
  expect(env.backend.HOST).toBe("127.0.0.1");
  const delivery = new URL(env.backend.DELIVERY_DRAGONFLY_URL);
  expect(delivery.port).toBe(String(hostDefaults.deliveryBrokerPort));
  expect(decodeURIComponent(delivery.password)).toBe(
    credentials.DELIVERY_DRAGONFLY_PASSWORD,
  );
  expect(env.backend.DELIVERY_DRAGONFLY_URL).not.toBe(
    env.backend.DRAGONFLY_URL,
  );
  expect(Object.hasOwn(env.frontend, "DELIVERY_DRAGONFLY_URL")).toBe(false);
  expect(env.backend.SMTP_HOST).toBe("127.0.0.1");
  expect(env.frontend.TRUSTED_WEB_PROXY_HOST).toBe("127.0.0.1");
  expect(env.backend.STORIES_MODE).toBe("enabled");
  expect(env.frontend.STORIES_MODE).toBe("enabled");
  expect(env.backend.STORIES_STORAGE_PROFILES).toContain(
    `http://127.0.0.1:${hostDefaults.storiesPort}`,
  );
  expect(Object.hasOwn(env.frontend, "AUTH_SIGNING_KEY")).toBe(false);
  expect(Object.hasOwn(env.backend, "SESSION_ENCRYPTION_KEY")).toBe(false);
});

test("startup applies the selected Stories mode over saved credentials in both app and Compose", () => {
  const settings = validateHostSettings({});
  const environment = deriveStartupEnvironment({
    settings,
    credentials,
    storiesMode: "disabled",
  });
  expect(environment.applications.backend.STORIES_MODE).toBe("disabled");
  expect(environment.applications.frontend.STORIES_MODE).toBe("disabled");
  expect(environment.compose.STORIES_MODE).toBe("disabled");
  expect(environment.compose).not.toHaveProperty("STORIES_STORAGE_PROFILES");
});

test("startup keeps Stories policy overrides identical in Compose and host backend", () => {
  const environment = deriveStartupEnvironment({
    settings: validateHostSettings({}),
    credentials,
    storiesMode: "enabled",
    overrides: {
      [environmentKeys.storiesMaxDurationMs]: "5000",
      [environmentKeys.storiesLifetimeMs]: "3600000",
    },
  });
  expect(environment.applications.backend.STORIES_MAX_DURATION_MS).toBe("5000");
  expect(environment.compose.STORIES_MAX_DURATION_MS).toBe("5000");
  expect(environment.applications.backend.STORIES_LIFETIME_MS).toBe("3600000");
  expect(environment.compose.STORIES_LIFETIME_MS).toBe("3600000");
});

test("local playback follows custom HTTPS port without changing external storage profiles", () => {
  const settings = validateHostSettings({
    [environmentKeys.httpsPort]: "24443",
  });
  const profiles = JSON.parse(credentials.STORIES_STORAGE_PROFILES) as object[];
  const environment = deriveStartupEnvironment({
    settings,
    credentials: {
      ...credentials,
      [environmentKeys.storiesStorageProfiles]: JSON.stringify([
        ...profiles,
        {
          ...profiles[0],
          id: "external-v1",
          endpoint: "https://storage.example",
          playbackEndpoint: "https://media.example",
        },
      ]),
    },
    storiesMode: "enabled",
  });
  const composeProfiles = JSON.parse(
    environment.compose.STORIES_STORAGE_PROFILES ?? "null",
  );
  const hostProfiles = JSON.parse(
    environment.applications.backend.STORIES_STORAGE_PROFILES ?? "null",
  );
  expect(composeProfiles[0].playbackEndpoint).toBe("https://localhost:24443");
  expect(hostProfiles[0].playbackEndpoint).toBe("https://localhost:24443");
  expect(composeProfiles[0].endpoint).toBe("http://rustfs:9000");
  expect(hostProfiles[0].endpoint).toBe("http://127.0.0.1:9000");
  expect(composeProfiles[1].playbackEndpoint).toBe("https://media.example");
  expect(hostProfiles[1].playbackEndpoint).toBe("https://media.example");
  expect(hostProfiles[1].endpoint).toBe("https://storage.example");
});
test("invalid credentials and ports fail without secret values", () => {
  expect(() =>
    validateHostSettings({ [environmentKeys.backendPort]: "bad" }),
  ).toThrow("Invalid host development settings");
  expect(() =>
    validateHostSettings({
      [environmentKeys.backendPort]: "3000",
      [environmentKeys.frontendPort]: "3000",
    }),
  ).toThrow("distinct");
  expect(() =>
    validateHostSettings({
      [environmentKeys.backendPort]: String(hostDefaults.storiesPort),
    }),
  ).toThrow("distinct");
  expect(() =>
    validateHostSettings({
      [environmentKeys.storiesMode]: "disabled",
      [environmentKeys.backendPort]: String(hostDefaults.storiesPort),
    }),
  ).not.toThrow();
  expect(() =>
    deriveHostEnvironment({
      settings: validateHostSettings({}),
      credentials: {
        ...credentials,
        [environmentKeys.authSigningKey]: "secret-invalid",
      },
    }),
  ).toThrow("Invalid private host credentials");
});

test("derived host values satisfy the existing application config owners", async () => {
  const { readServerConfig: readBackend } = await import(
    "../../apps/be-insta/src/lib/config/read"
  );
  const { readServerConfig: readFrontend } = await import(
    "../../apps/fe-insta/src/lib/config/server/read"
  );
  const environment = deriveHostEnvironment({
    settings: validateHostSettings({}),
    credentials,
  });
  expect(readBackend({ raw: environment.backend }).host).toBe("127.0.0.1");
  expect(readFrontend({ raw: environment.frontend }).trustedWebProxyHost).toBe(
    "127.0.0.1",
  );
});

test("occupied application port is refused without disturbing its owner", async () => {
  const { assertPortAvailable } = await import(
    "../../scripts/infra/host/preflight"
  );
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("preserved"),
  });
  try {
    const port = server.port;
    if (!port) throw new Error("Test server did not bind");
    await expect(assertPortAvailable({ port })).rejects.toThrow("occupied");
    expect(await (await fetch(server.url)).text()).toBe("preserved");
  } finally {
    await server.stop(true);
  }
});

test("broker init reuse and foreign-project rejection use actual container process identity", async () => {
  const { initializedForProcess } = await import(
    "../../scripts/infra/host/containers"
  );
  const { assertProjectOwnership, assertMode } = await import(
    "../../scripts/infra/host/preflight"
  );
  const { dockerFields, hostModeLabel, hostSettingsLabel } = await import(
    "../../scripts/infra/host/conts"
  );
  const snapshot = ({
    service,
    running,
    start,
    finish = "",
    code = 0,
    owner = process.cwd(),
  }: {
    readonly service: string;
    readonly running: boolean;
    readonly start: string;
    readonly finish?: string;
    readonly code?: number;
    readonly owner?: string;
  }) => ({
    [dockerFields.id]: service,
    [dockerFields.config]: {
      [dockerFields.image]: `${service}:test`,
      [dockerFields.labels]: {
        "com.docker.compose.service": service,
        "com.docker.compose.project.working_dir": owner,
        [hostModeLabel]: "host",
        [hostSettingsLabel]: "ports",
      },
    },
    [dockerFields.state]: {
      [dockerFields.running]: running,
      [dockerFields.status]: running ? "running" : "exited",
      [dockerFields.exitCode]: code,
      [dockerFields.startedAt]: start,
      [dockerFields.finishedAt]: finish,
      [dockerFields.health]: { [dockerFields.status]: "healthy" },
    },
    [dockerFields.networkSettings]: {
      [dockerFields.ports]: {},
      [dockerFields.networks]: {},
    },
  });
  const broker = snapshot({
    service: "dragonfly",
    running: true,
    start: "2026-10-11T00:00:00Z",
  });
  const init = snapshot({
    service: "broker-init",
    running: false,
    start: "2026-10-11T00:00:01Z",
    finish: "2026-10-11T00:00:02Z",
  });
  expect(
    initializedForProcess({
      containers: [broker, init],
      service: "broker-init",
      dependency: "dragonfly",
    }),
  ).toBe(true);
  expect(
    initializedForProcess({
      containers: [
        snapshot({
          service: "dragonfly",
          running: true,
          start: "2026-10-11T00:00:03Z",
        }),
        init,
      ],
      service: "broker-init",
      dependency: "dragonfly",
    }),
  ).toBe(false);
  expect(
    initializedForProcess({
      containers: [
        broker,
        snapshot({
          service: "broker-init",
          running: false,
          start: "2026-10-11T00:00:01Z",
          finish: "2026-10-11T00:00:02Z",
          code: 1,
        }),
      ],
      service: "broker-init",
      dependency: "dragonfly",
    }),
  ).toBe(false);
  expect(() =>
    assertMode({ containers: [broker], mode: "host", fingerprint: "ports" }),
  ).not.toThrow();
  expect(() =>
    assertMode({ containers: [broker], mode: "host", fingerprint: "changed" }),
  ).toThrow("conflicting");
  expect(() => assertMode({ containers: [broker], mode: "container" })).toThrow(
    "host-dev",
  );
  expect(() =>
    assertProjectOwnership([
      snapshot({
        service: "mongo",
        running: false,
        start: "",
        owner: "/another/checkout",
      }),
    ]),
  ).toThrow("another checkout");
});

test("Compose waits for Mongo's permanent network listener in both modes", async () => {
  const { z } = await import("zod");
  const overlay = z
    .object({
      services: z.object({
        mongo: z.object({
          healthcheck: z.object({ test: z.array(z.string()) }),
        }),
      }),
    })
    .parse(Bun.YAML.parse(await Bun.file("compose.yaml").text()));
  expect(overlay.services.mongo.healthcheck.test).toContain("--host");
  expect(overlay.services.mongo.healthcheck.test).toContain("mongo");
  const hostOverlay = z
    .object({
      services: z.object({
        rustfs: z.object({
          ports: z.array(z.string()),
          labels: z.record(z.string(), z.string()),
        }),
      }),
    })
    .parse(Bun.YAML.parse(await Bun.file("infra/compose/host.yaml").text()));
  expect(hostOverlay.services.rustfs.ports).toEqual([
    `127.0.0.1:${hostDefaults.storiesPort}:${hostDefaults.storiesPort}`,
  ]);
  expect(hostOverlay.services.rustfs.labels["insta.runtime-mode"]).toBe("host");
});
test("host SMTP does not wait for reverse DNS before greeting local apps", async () => {
  const { z } = await import("zod");
  const overlay = z
    .object({
      services: z.object({
        mailpit: z.object({ command: z.array(z.string()) }),
      }),
    })
    .parse(Bun.YAML.parse(await Bun.file("infra/compose/host.yaml").text()));
  expect(overlay.services.mailpit.command).toContain("--smtp-disable-rdns");
});
test("host proxy points only to chosen host apps and custom TLS redirect", async () => {
  const { renderHostProxy } = await import("../../scripts/infra/host/proxy");
  const settings = validateHostSettings({
    [environmentKeys.httpsPort]: "24443",
    [environmentKeys.backendPort]: "23001",
    [environmentKeys.frontendPort]: "23000",
  });
  const rendered = renderHostProxy({
    settings,
    dynamic: await Bun.file("infra/traefik/dynamic.yml").text(),
    static: await Bun.file("infra/traefik/static.yml").text(),
  });
  expect(rendered.dynamic).toContain("http://host.docker.internal:23001");
  expect(rendered.dynamic).toContain("http://host.docker.internal:23000");
  expect(rendered.static).toContain("to: ':24443'");
  expect(rendered.dynamic).toContain("Path(`/event`)");
  expect(rendered.dynamic).toContain("/certs/localhost.crt");
});

test("explicit canonical origin takes precedence over a selected host port", () => {
  Bun.env[environmentKeys.webOrigin] = "https://localhost";
  const environment = deriveHostEnvironment({
    settings: validateHostSettings({ [environmentKeys.httpsPort]: "24443" }),
    credentials,
  });
  expect(environment.frontend.ORIGIN).toBe("https://localhost");
  expect(environment.backend.REALTIME_ORIGIN).toBe("https://localhost");
});
