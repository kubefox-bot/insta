import { z } from "zod";
export const restartConfig = (
  runId: string,
  urls?: Readonly<{ mongo: string; broker: string }>,
) => {
  const id = z
    .string()
    .regex(/^insta-auth06-[a-f0-9-]{36}$/)
    .parse(runId);
  return {
    runId: id,
    namespace: `support_test_${id.replaceAll("-", "_")}`,
    recipient: `${id}@insta.test`,
    mongo: {
      url:
        urls?.mongo ??
        "mongodb://support-mongo:27017/?replicaSet=rs0&directConnection=true",
      database: "insta_api",
      timeoutMs: 2000,
      poolSize: 4,
    },
    dragonfly: {
      url: urls?.broker ?? "redis://:isolated-synthetic@support-broker:6379",
      timeoutMs: 2000,
    },
    smtp: { host: "support-mailpit", port: 1025 },
    signingKey: "a1".repeat(32),
    limitsKey: "b2".repeat(32),
  };
};
