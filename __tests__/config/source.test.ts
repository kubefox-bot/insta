import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readServerConfig } from "../../apps/fe-insta/src/lib/config/server/index";
import { environmentKeys } from "../../scripts/infra/host/conts";
import { ensureEnvironmentValues } from "../../scripts/infra/private-env";

const raw = Object.fromEntries([
  ["API_BASE_URL", "http://be-insta:3001"],
  [
    "WEB_MONGO_URL",
    "mongodb://web:synthetic@mongo:27017/insta_web?authSource=insta_web&replicaSet=rs0",
  ],
  ["SESSION_ENCRYPTION_KEY", "a".repeat(64)],
  ["BFF_SOURCE_SIGNING_KEY", "b".repeat(64)],
]);
const replace = (key: string, value: string | undefined) => ({
  ...raw,
  [key]: value,
});
test("source signing key is required/validated and only an explicit valid proxy hostname is accepted", () => {
  expect(() =>
    readServerConfig({ raw: replace("BFF_SOURCE_SIGNING_KEY", undefined) }),
  ).toThrow("bffSourceSigningKey");
  expect(() =>
    readServerConfig({
      raw: replace("BFF_SOURCE_SIGNING_KEY", "CANARY_invalid_key"),
    }),
  ).toThrow("bffSourceSigningKey");
  expect(() =>
    readServerConfig({ raw: replace("TRUSTED_WEB_PROXY_HOST", "*") }),
  ).toThrow("trustedWebProxyHost");
  expect(readServerConfig({ raw }).trustedWebProxyHost).toBeUndefined();
  expect(
    readServerConfig({ raw: replace("TRUSTED_WEB_PROXY_HOST", "traefik") })
      .trustedWebProxyHost,
  ).toBe("traefik");
});
test("local configuration appends only missing values and preserves prior values on every preparation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "insta-priv01-source-key-"));
  try {
    const path = join(directory, ".env");
    const original =
      "AUTH_SIGNING_KEY=synthetic-preserved\nSESSION_ENCRYPTION_KEY=synthetic-session";
    await Bun.write(path, original);
    await ensureEnvironmentValues({
      path,
      values: {
        [environmentKeys.bffSourceSigningKey]: "synthetic-source",
        [environmentKeys.storiesMode]: "enabled",
        [environmentKeys.storiesAccessKey]: "synthetic-access",
      },
    });
    expect(await Bun.file(path).text()).toBe(
      `${original}\nBFF_SOURCE_SIGNING_KEY=synthetic-source\nSTORIES_MODE=enabled\nSTORIES_ACCESS_KEY=synthetic-access\n`,
    );
    await ensureEnvironmentValues({
      path,
      values: {
        [environmentKeys.bffSourceSigningKey]: "replacement-must-not-appear",
        [environmentKeys.storiesMode]: "disabled",
        [environmentKeys.storiesAccessKey]: "replacement-must-not-appear",
      },
    });
    expect(await Bun.file(path).text()).toBe(
      `${original}\nBFF_SOURCE_SIGNING_KEY=synthetic-source\nSTORIES_MODE=enabled\nSTORIES_ACCESS_KEY=synthetic-access\n`,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
