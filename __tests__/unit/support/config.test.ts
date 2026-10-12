import { expect, test } from "bun:test";
import { readServerConfig } from "../../../apps/be-insta/src/lib/config/index";

const valid = Object.fromEntries([
  [
    "API_MONGO_URL",
    "mongodb://api:synthetic@mongo:27017/insta_api?authSource=insta_api&replicaSet=rs0",
  ],
  ["DRAGONFLY_URL", "redis://:synthetic@dragonfly:6379"],
  ["DELIVERY_DRAGONFLY_URL", "redis://:synthetic@dragonfly-delivery:6379"],
  ["AUTH_SIGNING_KEY", "a".repeat(64)],
  ["BFF_SOURCE_SIGNING_KEY", "b".repeat(64)],
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
test("support mail configuration accepts only local Mailpit hosts and server test recipient", () => {
  expect(() =>
    readServerConfig({
      raw: Object.fromEntries([
        ...Object.entries(valid),
        ["SUPPORT_SMTP_HOST", "smtp.external.test"],
      ]),
    }),
  ).toThrow();
  expect(() =>
    readServerConfig({
      raw: Object.fromEntries([
        ...Object.entries(valid),
        ["SUPPORT_RECIPIENT", "outside@example.com"],
      ]),
    }),
  ).toThrow();
  expect(readServerConfig({ raw: valid })).toMatchObject({
    supportRecipient: "support@insta.test",
    supportSmtp: { host: "mailpit", port: 1025 },
  });
});
