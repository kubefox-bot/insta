import { expect, spyOn, test } from "bun:test";
import { readServerConfig } from "../../apps/be-insta/src/lib/config/index";
import { readRealtimeConfig } from "../../apps/be-insta/src/lib/config/realtime/read";

const keys = [
  "REALTIME_RETENTION_MS",
  "REALTIME_ACK_TIMEOUT_MS",
  "REALTIME_REPLAY_PAGE_SIZE",
  "REALTIME_MAX_UNREAD_BATCH_SIZE",
  "REALTIME_MAX_APPLY_FAILURES",
  "REALTIME_DELIVERY_RETRY_BASE_MS",
  "REALTIME_DELIVERY_RETRY_CAP_MS",
  "REALTIME_MAX_SUBSCRIPTIONS_PER_SOCKET",
];

test("realtime defaults provide bounded retention, retry and per-socket resources", () => {
  expect(readRealtimeConfig({}).retentionMs).toBe(86_400_000);
  expect(readRealtimeConfig({}).maxApplyFailures).toBe(5);
  expect(readRealtimeConfig({})).toEqual({
    retentionMs: 86_400_000,
    ackTimeoutMs: 5000,
    replayPageSize: 64,
    maxUnreadBatchSize: 64,
    maxApplyFailures: 5,
    deliveryRetryBaseMs: 1000,
    deliveryRetryCapMs: 30_000,
    maxSubscriptionsPerSocket: 6,
  });
});

test("positive bounded overrides are parsed at the configuration boundary", () => {
  expect(
    readRealtimeConfig(Object.fromEntries(keys.map((key) => [key, "1"]))),
  ).toEqual({
    retentionMs: 1,
    ackTimeoutMs: 1,
    replayPageSize: 1,
    maxUnreadBatchSize: 1,
    maxApplyFailures: 1,
    deliveryRetryBaseMs: 1,
    deliveryRetryCapMs: 1,
    maxSubscriptionsPerSocket: 1,
  });
  for (const key of keys)
    for (const value of [
      "",
      " ",
      "0",
      "-1",
      "1.5",
      "NaN",
      "Infinity",
      "9007199254740992",
      "private-canary",
    ])
      expect(() => readRealtimeConfig({ [key]: value })).toThrow(
        "Invalid realtime configuration",
      );
});

test("wire and operational capacity limits reject oversized overrides", () => {
  for (const [key, allowed, rejected] of [
    ["REALTIME_MAX_UNREAD_BATCH_SIZE", "64", "65"],
    ["REALTIME_REPLAY_PAGE_SIZE", "1024", "1025"],
    ["REALTIME_MAX_APPLY_FAILURES", "1000", "1001"],
    ["REALTIME_MAX_SUBSCRIPTIONS_PER_SOCKET", "1024", "1025"],
    ["REALTIME_RETENTION_MS", "2147483647", "2147483648"],
    ["REALTIME_ACK_TIMEOUT_MS", "2147483647", "2147483648"],
    ["REALTIME_DELIVERY_RETRY_CAP_MS", "2147483647", "2147483648"],
  ] as const) {
    expect(() => readRealtimeConfig({ [key]: allowed })).not.toThrow();
    expect(() => readRealtimeConfig({ [key]: rejected })).toThrow(
      "Invalid realtime configuration",
    );
  }
  expect(() =>
    readRealtimeConfig(
      Object.fromEntries([["REALTIME_DELIVERY_RETRY_BASE_MS", "30001"]]),
    ),
  ).toThrow();
  expect(() =>
    readRealtimeConfig(
      Object.fromEntries([["REALTIME_DELIVERY_RETRY_BASE_MS", "30000"]]),
    ),
  ).not.toThrow();
});

test("expiry arithmetic rejects unsupported dates and errors never expose raw values", () => {
  const clock = spyOn(Date, "now").mockReturnValue(8_640_000_000_000_000 - 1);
  try {
    expect(() => readRealtimeConfig({})).toThrow(
      "Invalid realtime configuration",
    );
  } finally {
    clock.mockRestore();
  }
  try {
    readRealtimeConfig(
      Object.fromEntries([["REALTIME_ACK_TIMEOUT_MS", "private-canary"]]),
    );
  } catch (error) {
    expect(String(error)).not.toContain("private-canary");
  }
});

test("server composition receives validated realtime configuration", () => {
  const raw = Object.fromEntries([
    [
      "API_MONGO_URL",
      "mongodb://api:synthetic@mongo:27017/insta_api?authSource=insta_api&replicaSet=rs0",
    ],
    ["DRAGONFLY_URL", "redis://:synthetic@dragonfly:6379"],
    ["DELIVERY_DRAGONFLY_URL", "redis://:delivery@dragonfly-delivery:6379"],
    ["AUTH_SIGNING_KEY", "a".repeat(64)],
    ["BFF_SOURCE_SIGNING_KEY", "b".repeat(64)],
    ["STORIES_MODE", "disabled"],
    ["REALTIME_ACK_TIMEOUT_MS", "1234"],
  ]);
  expect(readServerConfig({ raw })).toMatchObject({
    realtime: { ackTimeoutMs: 1234, retentionMs: 86_400_000 },
  });
  expect(() =>
    readServerConfig({
      raw: {
        ...raw,
        ...Object.fromEntries([["REALTIME_MAX_UNREAD_BATCH_SIZE", "65"]]),
      },
    }),
  ).toThrow("Invalid realtime configuration");
});
