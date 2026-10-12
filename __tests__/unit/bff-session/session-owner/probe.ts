import { mock } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { z } from "zod";
import { readServerConfig } from "../../../../apps/fe-insta/src/lib/config/server/index";
import { startRevocationWorker } from "../../../../apps/fe-insta/src/lib/session/server/adapters/worker";
import type { SessionStore } from "../../../../apps/fe-insta/src/lib/session/server/ports/store";

const scenario = z
  .enum([
    "failed-startup",
    "database-await",
    "indexes-await",
    "ready-await",
    "normal",
  ])
  .parse(process.argv[2]);
const acquisition = Promise.withResolvers<{ webDb: object }>();
const acquired = Promise.withResolvers<void>();
const indexes = Promise.withResolvers<void>();
const indexing = Promise.withResolvers<void>();
const lookup = Promise.withResolvers<void>();
const original = new Error("Synthetic startup acquisition cancelled");
const stats = {
  acquisitions: 0,
  starts: 0,
  stops: 0,
  claims: 0,
  claimsAfterStop: 0,
  lookupActive: false,
  infrastructure: 0,
  prematureRelease: false,
};
let stopping = false;
const stops: Array<() => Promise<void>> = [];
const config = readServerConfig({
  raw: Object.fromEntries([
    ["API_BASE_URL", "http://synthetic.invalid"],
    [
      "WEB_MONGO_URL",
      "mongodb://synthetic:synthetic@synthetic.invalid/insta_web?authSource=insta_web&replicaSet=rs0",
    ],
    ["SESSION_ENCRYPTION_KEY", "a1".repeat(32)],
    ["BFF_SOURCE_SIGNING_KEY", "b2".repeat(32)],
  ]),
});
const unused = async (): Promise<never> => {
  throw new Error("Unexpected session provider operation");
};
const store: SessionStore = {
  create: unused,
  read: unused,
  beginRefresh: unused,
  takeOver: unused,
  finishRefresh: unused,
  block: unused,
  expire: unused,
  beginRevocation: unused,
  finishRevocation: unused,
  pendingRevocations: async () => {
    stats.claims++;
    if (stopping) stats.claimsAfterStop++;
    stats.lookupActive = true;
    try {
      await lookup.promise;
      return [];
    } finally {
      stats.lookupActive = false;
    }
  },
};
mock.module(
  new URL(
    "../../../../apps/fe-insta/src/lib/config/server/index.ts",
    import.meta.url,
  ).pathname,
  () => ({ readRuntimeConfig: () => config }),
);
mock.module(
  new URL(
    "../../../../apps/fe-insta/src/app/infrastructure/server/database/create.ts",
    import.meta.url,
  ).pathname,
  () => ({
    acquireDatabase: async () => {
      stats.acquisitions++;
      acquired.resolve();
      return stats.acquisitions === 1 ? acquisition.promise : { webDb: {} };
    },
    cancelDatabaseAcquisition: () => {},
    closeInfrastructure: async () => {
      stats.prematureRelease ||= stats.lookupActive;
      stats.infrastructure++;
    },
  }),
);
mock.module(
  new URL(
    "../../../../apps/fe-insta/src/lib/session/server/index.ts",
    import.meta.url,
  ).pathname,
  () => ({
    ensureSessionIndexes: async () => {
      indexing.resolve();
      await indexes.promise;
    },
    createMongoSessionStore: () => store,
    createSessionCrypto: () => ({
      sealCredentials: unused,
      openCredentials: unused,
      sealRevokeSecret: unused,
      openRevokeSecret: unused,
    }),
    createBackendAuth: () => ({
      refresh: async () => Result.Error({ code: "UNUSED" }),
      authorize: async () => Result.Error({ code: "UNUSED" }),
      revoke: async () => Result.Error({ code: "UNUSED" }),
    }),
    startRevocationWorker: (
      options: Parameters<typeof startRevocationWorker>[0],
    ) => {
      stats.starts++;
      const stop = startRevocationWorker(options);
      const close = async () => {
        stats.stops++;
        await stop();
      };
      stops.push(close);
      return close;
    },
  }),
);
mock.module(
  new URL(
    "../../../../apps/fe-insta/src/app/continuation/server/index.ts",
    import.meta.url,
  ).pathname,
  () => ({ closeContinuation: async () => {} }),
);
mock.module(
  new URL(
    "../../../../apps/fe-insta/src/app/observability/server/index.ts",
    import.meta.url,
  ).pathname,
  () => ({ closeObservability: async () => {} }),
);

const owner = await import(
  "../../../../apps/fe-insta/src/app/users/server/session/create.ts"
);
const shutdown = await import(
  "../../../../apps/fe-insta/src/app/lifecycle/server/shutdown.ts"
);
const request = () =>
  owner
    .createSessionRequest({ context: {}, source: async () => "127.0.0.1" })
    .then(
      (value) => ({ kind: "ready" as const, store: value.store }),
      (error: unknown) => ({
        kind: "rejected" as const,
        original: error === original,
      }),
    );
const beginStop = () => {
  stopping = true;
  shutdown.prepareShutdown();
};
const snapshot = () => ({ ...stats });
try {
  const startup = owner.initializeSessions();
  const initial = request();
  await acquired.promise;
  if (scenario === "failed-startup") {
    beginStop();
    acquisition.reject(original);
    const failed = await initial;
    await startup;
    await shutdown.closeApplication();
    indexes.resolve();
    const delayed = await request();
    process.stdout.write(
      JSON.stringify({ initial: failed, delayed: delayed.kind, ...snapshot() }),
    );
  } else if (scenario === "database-await" || scenario === "indexes-await") {
    if (scenario === "indexes-await") {
      acquisition.resolve({ webDb: {} });
      await indexing.promise;
    }
    beginStop();
    acquisition.resolve({ webDb: {} });
    indexes.resolve();
    const crossing = await initial;
    const closing = shutdown.closeApplication();
    lookup.resolve();
    await closing;
    process.stdout.write(
      JSON.stringify({ crossing: crossing.kind, ...snapshot() }),
    );
  } else {
    acquisition.resolve({ webDb: {} });
    indexes.resolve();
    const first = await initial;
    await startup;
    const next = request();
    if (scenario === "normal") await next;
    beginStop();
    const crossing = await next;
    const closing = shutdown.closeApplication();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const held = snapshot();
    lookup.resolve();
    await closing;
    process.stdout.write(
      JSON.stringify({
        first: first.kind,
        crossing: crossing.kind,
        held,
        ...snapshot(),
      }),
    );
  }
} finally {
  acquisition.resolve({ webDb: {} });
  indexes.resolve();
  lookup.resolve();
  await Promise.all(stops.map((stop) => stop()));
  await shutdown.closeApplication();
}
