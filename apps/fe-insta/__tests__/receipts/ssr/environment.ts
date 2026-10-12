/** Изолирует синтетическую SSR-конфигурацию и локальный HTTP policy provider; владелец обязан вызвать close. */
export const createSsrEnvironment = () => {
  let policyReads = 0;
  const policyStarted = Promise.withResolvers<void>();
  const provider = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => {
      policyReads += 1;
      policyStarted.resolve();
      return Response.json({
        ok: true,
        data: {
          maxDurationMs: 15000,
          lifetimeMs: 86400000,
          maxFileBytes: 20971520,
          captureSafetyMarginMs: 200,
        },
        meta: { requestId: "ssr-policy" },
      });
    },
  });
  const values = Object.fromEntries([
    ["API_BASE_URL", `http://127.0.0.1:${provider.port}`],
    [
      "WEB_MONGO_URL",
      "mongodb://synthetic:synthetic@127.0.0.1:1/insta_web?authSource=insta_web&replicaSet=rs0",
    ],
    ["SESSION_ENCRYPTION_KEY", "a".repeat(64)],
    ["BFF_SOURCE_SIGNING_KEY", "b".repeat(64)],
    ["STORIES_MODE", "enabled"],
  ]);
  const original = new Map(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, values);
  return {
    policyStarted: policyStarted.promise,
    policyReads: () => policyReads,
    setStories: (mode: "enabled" | "disabled") => {
      process.env.STORIES_MODE = mode;
    },
    close: () => {
      provider.stop(true);
      for (const [key, value] of original) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
};
