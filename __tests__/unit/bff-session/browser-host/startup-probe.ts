import { mock } from "bun:test";

const original = new Error("Owned router acquisition failed");
const cleanup = new Error("Owned fixture disposal failed");
const cleanupFails = process.argv[2] === "cleanup-fails";
let accounts = 0;
let disposals = 0;
mock.module(
  new URL("../../../fixtures/bff-session/environment.ts", import.meta.url)
    .pathname,
  () => ({
    createBffEnvironment: async () => ({
      native: {
        account: async () => {
          accounts++;
          return {
            email: `owned-${accounts}@example.test`,
            password: "synthetic",
          };
        },
        db: {
          collection: () => ({ find: () => ({ toArray: async () => [] }) }),
        },
      },
      web: {
        webDb: {
          collection: () => ({
            deleteMany: async () => undefined,
            countDocuments: async () => 0,
          }),
        },
      },
      dispose: async () => {
        disposals++;
        if (cleanupFails) throw cleanup;
      },
    }),
  }),
);
mock.module(
  new URL("../../../fixtures/bff-session/faults/router.ts", import.meta.url)
    .pathname,
  () => ({
    createSessionFaultRouter: async () => {
      throw original;
    },
  }),
);
const error = await import(
  new URL("../../../fixtures/bff-session/browser-host.ts", import.meta.url)
    .pathname
).then(
  () => undefined,
  (error: unknown) => error,
);
const aggregate = error instanceof AggregateError ? error : undefined;
process.stdout.write(
  JSON.stringify({
    accounts,
    disposals,
    originalPreserved: cleanupFails
      ? aggregate?.cause === original
      : error === original,
    cleanupPreserved:
      aggregate?.errors.some(
        (item: unknown) =>
          item instanceof AggregateError && item.errors.includes(cleanup),
      ) ?? false,
  }),
);
