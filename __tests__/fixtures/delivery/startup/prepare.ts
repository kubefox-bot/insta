import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { readCommandEnvironment } from "../../../../scripts/infra/config";
import { readRealtimeFixtureConfig } from "../../realtime/config";
/** Готовит только run-owned настройки и source overlays; образ обязан прийти из существующего acceptance config. */
export const prepareStartupWorkspace = async ({
  root,
  directory,
  project,
}: Readonly<{ root: string; directory: string; project: string }>) => {
  const secrets = Object.fromEntries([
    ["MONGO_ROOT_PASSWORD", "synthetic-root"],
    ["API_MONGO_PASSWORD", "synthetic-api"],
    ["WEB_MONGO_PASSWORD", "synthetic-web"],
    ["DRAGONFLY_PASSWORD", "synthetic-auth"],
    ["DELIVERY_DRAGONFLY_PASSWORD", "synthetic-delivery"],
    ["AUTH_SIGNING_KEY", "a".repeat(64)],
    ["SESSION_ENCRYPTION_KEY", "b".repeat(64)],
    ["BFF_SOURCE_SIGNING_KEY", "c".repeat(64)],
    ["STORIES_MODE", "disabled"],
    ["STORIES_ACTIVE_PROFILE", "local-v1"],
    [
      "STORIES_STORAGE_PROFILES",
      JSON.stringify([
        {
          id: "local-v1",
          endpoint: "http://rustfs:9000",
          playbackEndpoint: "https://localhost",
          bucket: "stories",
          region: "us-east-1",
          prefix: "stories/",
          accessKeyId: "synthetic-access",
          secretAccessKey: "synthetic-storage",
        },
      ]),
    ],
    ["STORIES_ACCESS_KEY", "synthetic-access"],
    ["STORIES_SECRET_KEY", "synthetic-storage"],
  ]);
  const reservation = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(),
  });
  const port = reservation.port;
  const mailReservation = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(),
  });
  const mailPort = mailReservation.port;
  await mailReservation.stop(true);
  await reservation.stop(true);
  if (!port) throw new Error("Missing fixture port");
  const overlay = join(directory, "overlay.yaml");
  const resetOverlay = join(directory, "no-build.yaml");
  const environment = {
    ...readCommandEnvironment(),
    ...secrets,
    ...Object.fromEntries([
      ["COMPOSE_PROJECT_NAME", project],
      [
        "COMPOSE_FILE",
        `${join(directory, "compose.yaml")}:${overlay}:${resetOverlay}`,
      ],
      ["BE_PORT", String(port)],
      ["MAILPIT_PORT", String(mailPort)],
    ]),
  };
  for (const path of ["scripts", "apps", "packages", "node_modules"])
    await symlink(join(root, path), join(directory, path));
  await mkdir(join(directory, "infra/traefik"), { recursive: true });
  await mkdir(join(directory, "infra/certs"), { recursive: true });
  await symlink(join(root, "infra/mongo"), join(directory, "infra/mongo"));
  await Bun.write(
    join(directory, "compose.yaml"),
    await Bun.file(join(root, "compose.yaml")).text(),
  );
  for (const path of [
    "infra/traefik/dynamic.yml",
    "infra/certs/localhost.crt",
    "infra/certs/localhost.key",
  ])
    await Bun.write(
      join(directory, path),
      await Bun.file(join(root, path)).text(),
      { mode: 0o600 },
    );
  await Bun.write(
    join(directory, ".env"),
    Object.entries(secrets)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  const { image } = readRealtimeFixtureConfig();
  if (!image)
    throw new Error(
      "CHAT03_TESTHOST_IMAGE must identify the prepared immutable testhost",
    );
  const sourceMounts = [
    "apps/be-insta/src",
    "apps/be-insta/__tests__",
    "__tests__",
    "packages/contracts/src",
    "infra/dragonfly",
  ].map((path) => `${join(root, path)}:/workspace/${path}:ro`);
  const common = {
    image,
    ["pull_policy"]: "never",
    volumes: sourceMounts,
    labels: { "insta.testRunId": project },
  };
  const services = {
    "be-insta": {
      ...common,
      command: [
        "bun",
        "--cwd",
        "apps/be-insta",
        "__tests__/fixtures/delivery/isolation-api.ts",
      ],
      ports: ["127.0.0.1::3002"],
      environment: Object.fromEntries([
        [
          "WEB_MONGO_URL",
          "mongodb://insta_web:synthetic-web@mongo:27017/insta_web?authSource=insta_web&replicaSet=rs0",
        ],
        ["SESSION_ENCRYPTION_KEY", "b".repeat(64)],
        ["API_BASE_URL", "http://be-insta:3001"],
      ]),
    },
    "broker-init": common,
    "delivery-broker-init": common,
    "dragonfly-delivery": {
      labels: { "insta.testRunId": project },
      entrypoint: ["/bin/sh", "-c", "exec sleep infinity"],
    },
    dragonfly: { labels: { "insta.testRunId": project } },
    mongo: { labels: { "insta.testRunId": project } },
    "mongo-init": { labels: { "insta.testRunId": project } },
    mailpit: { labels: { "insta.testRunId": project } },
  };
  const volumes = Object.fromEntries(
    [
      "mongo-data",
      "dragonfly-data",
      "dragonfly-delivery-data",
      "mailpit-data",
    ].map((name) => [name, { labels: { "insta.testRunId": project } }]),
  );
  const value = Bun.YAML.stringify({
    services,
    volumes,
    networks: { default: { labels: { "insta.testRunId": project } } },
    secrets: {
      ["mongo_key"]: { file: join(directory, ".infra/mongo-key") },
      ["mongo_users"]: { file: join(directory, ".infra/mongo-users.json") },
    },
  });
  await Bun.write(overlay, value, { mode: 0o600 });
  await Bun.write(
    resetOverlay,
    "services:\n" +
      ["be-insta", "broker-init", "delivery-broker-init"]
        .map((service) => `  ${service}:\n    build: !reset null\n`)
        .join(""),
    { mode: 0o600 },
  );

  return { environment, port };
};
