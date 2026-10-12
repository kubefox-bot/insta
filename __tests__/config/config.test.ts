import { expect, test } from "bun:test";
import { readServerConfig } from "../../apps/be-insta/src/lib/config/index";
import { readServerConfig as readWebConfig } from "../../apps/fe-insta/src/lib/config/server/index";

const valid = Object.fromEntries([
  [
    "API_MONGO_URL",
    "mongodb://api:synthetic-password@mongo:27017/insta_api?authSource=insta_api&replicaSet=rs0",
  ],
  ["DRAGONFLY_URL", "redis://:synthetic-password@dragonfly:6379"],
  ["DELIVERY_DRAGONFLY_URL", "redis://:delivery@dragonfly-delivery:6379"],
  ["AUTH_SIGNING_KEY", "a".repeat(64)],
  ["BFF_SOURCE_SIGNING_KEY", "c".repeat(64)],
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
        accessKeyId: "fixture-access",
        secretAccessKey: "fixture-secret",
      },
    ]),
  ],
]);
const replace = (key: string, value: string) => ({ ...valid, [key]: value });
test("missing and invalid configuration fails without exposing secrets", () => {
  for (const raw of [
    {},
    replace("AUTH_SIGNING_KEY", "secret-canary"),
    replace("API_MONGO_URL", "https://secret-canary"),
  ]) {
    expect(() => readServerConfig({ raw })).toThrow();
    try {
      readServerConfig({ raw });
    } catch (error) {
      expect(String(error)).not.toContain("secret-canary");
      expect(String(error)).not.toContain("synthetic-password");
    }
  }
});
test("validated configuration rejects cross-owner database and missing broker credentials", () => {
  expect(() =>
    readServerConfig({
      raw: replace(
        "API_MONGO_URL",
        "mongodb://api:synthetic@mongo:27017/insta_web?authSource=insta_web&replicaSet=rs0",
      ),
    }),
  ).toThrow();
  expect(() =>
    readServerConfig({
      raw: replace("DRAGONFLY_URL", "redis://dragonfly:6379"),
    }),
  ).toThrow();
});
test("configuration accepts explicit credentials and returns typed defaults", () => {
  expect(readServerConfig({ raw: valid })).toMatchObject({
    port: 3001,
    host: "127.0.0.1",
    mongo: { database: "insta_api" },
  });
});
test("BFF requires its own database and encryption key", () => {
  const raw = Object.fromEntries([
    ...Object.entries(valid),
    ["API_BASE_URL", "http://be-insta:3001"],
    [
      "WEB_MONGO_URL",
      "mongodb://web:synthetic@mongo:27017/insta_web?authSource=insta_web&replicaSet=rs0",
    ],
    ["SESSION_ENCRYPTION_KEY", "b".repeat(64)],
    ["BFF_SOURCE_SIGNING_KEY", "c".repeat(64)],
  ]);
  expect(() =>
    readWebConfig({
      raw: {
        ...raw,
        ...Object.fromEntries([["SESSION_ENCRYPTION_KEY", "short-secret"]]),
      },
    }),
  ).toThrow();
  expect(readWebConfig({ raw })).toMatchObject({
    mongo: { database: "insta_web" },
  });
});

test("runtime BFF API budget must leave room for optional health; low-level API budgets stay independent", async () => {
  const raw = Object.fromEntries([
    ["API_BASE_URL", "http://be-insta:3001"],
    [
      "WEB_MONGO_URL",
      "mongodb://web:synthetic@mongo:27017/insta_web?authSource=insta_web&replicaSet=rs0",
    ],
    ["SESSION_ENCRYPTION_KEY", "b".repeat(64)],
    ["BFF_SOURCE_SIGNING_KEY", "c".repeat(64)],
    ["API_TIMEOUT_MS", "999"],
  ]);
  expect(() => readWebConfig({ raw })).toThrow("API_TIMEOUT_MS");
  expect(
    readWebConfig({
      raw: { ...raw, ...Object.fromEntries([["API_TIMEOUT_MS", "1000"]]) },
    }).api.timeoutMs,
  ).toBe(1000);
  const { readApiConfiguration } = await import(
    "../../apps/fe-insta/src/lib/config/server/index"
  );
  expect(
    readApiConfiguration(
      Object.fromEntries([
        ["API_BASE_URL", raw.API_BASE_URL],
        ["API_TIMEOUT_MS", "25"],
      ]),
    ).timeoutMs,
  ).toBe(25);
});

test("minimal operational logging validates its settings without requiring persistence or API configuration", async () => {
  const { readLoggingConfig } = await import(
    "../../apps/fe-insta/src/lib/config/server/index"
  );
  expect(readLoggingConfig({})).toEqual({
    level: "info",
    flushTimeoutMs: 1000,
  });
  expect(() =>
    readLoggingConfig(
      Object.fromEntries([["LOG_LEVEL", "invalid-CANARY_token"]]),
    ),
  ).toThrow("Invalid logging configuration: LOG_LEVEL");
});
