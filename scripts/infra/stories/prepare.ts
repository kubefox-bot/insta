import { randomBytes } from "node:crypto";
import { z } from "zod";
import { readStoriesConfig } from "../../../apps/be-insta/src/lib/config";
import { secureDirectory, writePrivateFile } from "../artifacts";
import { readCommandEnvironment } from "../config";
import { privateUmask, secretBytes } from "../conts";
import { storiesInfra } from "./conts";
import { createStoriesTelemetryProfiles } from "./telemetry";

process.umask(privateUmask);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const args = z
  .object({ fe: digest, be: digest, testhost: digest })
  .strict()
  .parse(
    Object.fromEntries(
      Bun.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")),
    ),
  );
await secureDirectory(".infra");
await writePrivateFile({
  path: storiesInfra.configPath,
  content: JSON.stringify({
    id: storiesInfra.profile,
    endpoint: storiesInfra.endpoint,
    playbackEndpoint: storiesInfra.playbackEndpoint,
    bucket: storiesInfra.bucket,
    region: storiesInfra.region,
    prefix: storiesInfra.prefix,
    accessKeyId: randomBytes(secretBytes).toString("hex"),
    secretAccessKey: randomBytes(secretBytes).toString("hex"),
  }),
});
const profile = z
  .object({
    id: z.string(),
    endpoint: z.string(),
    playbackEndpoint: z.string(),
    bucket: z.string(),
    region: z.string(),
    prefix: z.string(),
    accessKeyId: z.string(),
    secretAccessKey: z.string(),
  })
  .strict()
  .parse(await Bun.file(storiesInfra.configPath).json());
const storageEnvironment = {
  ...Object.fromEntries([["STORIES_MODE", "enabled"]]),
  ...Object.fromEntries([["STORIES_ACTIVE_PROFILE", profile.id]]),
  ...Object.fromEntries([
    ["STORIES_STORAGE_PROFILES", JSON.stringify([profile])],
  ]),
};
const configuration = readStoriesConfig({
  ...readCommandEnvironment(),
  ...storageEnvironment,
});
if (configuration.mode !== "enabled")
  throw new Error("Enabled Stories configuration required");
const environment = {
  ...storageEnvironment,
  ...Object.fromEntries([
    ["STORIES_MAX_DURATION_MS", String(configuration.policy.maxDurationMs)],
    ["STORIES_LIFETIME_MS", String(configuration.policy.lifetimeMs)],
  ]),
};
const base = z
  .object({
    http: z
      .object({
        routers: z.record(z.string(), z.unknown()),
        services: z.record(z.string(), z.unknown()),
      })
      .passthrough(),
  })
  .passthrough()
  .parse(Bun.YAML.parse(await Bun.file("infra/traefik/dynamic.yml").text()));
const extra = z
  .object({
    http: z.object({
      routers: z.record(z.string(), z.unknown()),
      services: z.record(z.string(), z.unknown()),
    }),
  })
  .parse(Bun.YAML.parse(await Bun.file("infra/traefik/stories.yml").text()));
await writePrivateFile({
  path: storiesInfra.dynamicPath,
  mode: "replace",
  content: JSON.stringify({
    ...base,
    http: {
      ...base.http,
      routers: { ...base.http.routers, ...extra.http.routers },
      services: { ...base.http.services, ...extra.http.services },
    },
  }),
});
const storiesCompose = {
  services: {
    "be-insta": { image: args.be, environment },
    "fe-insta": {
      image: args.fe,
      environment: {
        ...Object.fromEntries([["STORIES_MODE", "enabled"]]),
      },
    },
    testhost: {
      image: args.testhost,
      volumes: [],
      user: "bun",
      ...Object.fromEntries([["working_dir", "/workspace"]]),
      environment: {
        ...environment,
        ...Object.fromEntries([
          [
            "STORIES_TEST_CA",
            await Bun.file("infra/certs/localhost.crt").text(),
          ],
        ]),
      },
    },
    rustfs: {
      image: storiesInfra.image,
      volumes: ["stories-storage:/data"],
      environment: {
        ...Object.fromEntries([["RUSTFS_ACCESS_KEY", profile.accessKeyId]]),
        ...Object.fromEntries([["RUSTFS_SECRET_KEY", profile.secretAccessKey]]),
      },
    },
    traefik: {
      volumes: [`./${storiesInfra.dynamicPath}:/etc/traefik/dynamic.yml:ro`],
    },
  },
};
await writePrivateFile({
  path: storiesInfra.composePath,
  mode: "replace",
  content: JSON.stringify(storiesCompose, null, 2),
});
const telemetry = createStoriesTelemetryProfiles(storiesCompose.services);
for (const [name, profile] of Object.entries(telemetry))
  await writePrivateFile({
    path: `.infra/stories-${name}.json`,
    mode: "replace",
    content: JSON.stringify(profile, null, 2),
  });
await writePrivateFile({
  path: ".infra/stories-core-compose.json",
  mode: "replace",
  content: `${JSON.stringify(
    {
      services: {
        "be-insta": {
          image: args.be,
          environment: {
            ...Object.fromEntries([["STORIES_MODE", "disabled"]]),
          },
        },
        "fe-insta": {
          image: args.fe,
          environment: {
            ...Object.fromEntries([["STORIES_MODE", "disabled"]]),
          },
        },
        testhost: {
          image: args.testhost,
          volumes: [],
          user: "bun",
          ...Object.fromEntries([["working_dir", "/workspace"]]),
          environment: {
            ...Object.fromEntries([["STORIES_MODE", "disabled"]]),
          },
        },
      },
    },
    null,
    2,
  )}\n`,
});
console.log(
  "Private Stories and disabled Core profiles prepared; no services changed.",
);
