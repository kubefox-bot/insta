import { expect, test } from "bun:test";
import { readServerConfig } from "../../apps/be-insta/src/lib/config/index";

const valid = {
  ["API_MONGO_URL"]:
    "mongodb://api:synthetic@mongo:27017/insta_api?authSource=insta_api&replicaSet=rs0",
  ["DRAGONFLY_URL"]: "redis://:synthetic@dragonfly:6379",
  ["AUTH_SIGNING_KEY"]: "a".repeat(64),
  ["BFF_SOURCE_SIGNING_KEY"]: "b".repeat(64),
  ["STORIES_MODE"]: "disabled",
};
test("delivery provider is mandatory and never falls back to auth", () => {
  expect(() => readServerConfig({ raw: valid })).toThrow(
    "deliveryDragonflyUrl",
  );
});
test.each(["http://:secret-canary@delivery:6379", "redis://delivery:6379", ""])(
  "delivery rejects invalid dedicated URL %s without secrets",
  (value) => {
    expect(() =>
      readServerConfig({
        raw: { ...valid, ["DELIVERY_DRAGONFLY_URL"]: value },
      }),
    ).toThrow("deliveryDragonflyUrl");
    try {
      readServerConfig({
        raw: { ...valid, ["DELIVERY_DRAGONFLY_URL"]: value },
      });
    } catch (error) {
      expect(String(error)).not.toContain("secret-canary");
    }
  },
);
test("dedicated delivery connection has explicit URL and bounded timeout", () => {
  expect(
    readServerConfig({
      raw: {
        ...valid,
        ["DELIVERY_DRAGONFLY_URL"]: "rediss://:delivery@streams:6380",
      },
    }),
  ).toMatchObject({
    dragonfly: { url: "redis://:synthetic@dragonfly:6379" },
    deliveryDragonfly: {
      url: "rediss://:delivery@streams:6380",
      timeoutMs: 10000,
    },
  });
});

test("delivery cannot target auth endpoint even with different credentials", () => {
  expect(() =>
    readServerConfig({
      raw: {
        ...valid,
        ["DELIVERY_DRAGONFLY_URL"]: "redis://:different@dragonfly:6379",
      },
    }),
  ).toThrow("deliveryDragonflyUrl");
});
