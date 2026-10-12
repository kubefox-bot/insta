import { z } from "zod";

export const readProcessEnvironment = (
  configuration: Readonly<Record<string, string>> = {},
) => ({
  ...Object.fromEntries([["PATH", z.string().min(1).parse(Bun.env.PATH)]]),
  ...configuration,
});

export const readSyntheticWebConfiguration = () =>
  Object.fromEntries([
    ["API_BASE_URL", "http://127.0.0.1:1"],
    [
      "WEB_MONGO_URL",
      "mongodb://web:synthetic@127.0.0.1:1/insta_web?authSource=insta_web&replicaSet=rs0",
    ],
    ["SESSION_ENCRYPTION_KEY", "a".repeat(64)],
    ["BFF_SOURCE_SIGNING_KEY", "b".repeat(64)],
  ]);

export const installSyntheticWebConfiguration = () => {
  Object.assign(Bun.env, readSyntheticWebConfiguration());
};
