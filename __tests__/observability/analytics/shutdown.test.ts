import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import {
  analyticsSinkNames,
  startCanonicalAnalytics,
} from "../../../apps/be-insta/src/lib/observability/analytics/index";

test("analytics shutdown aborts current projection and waits for cleanup before retaining its retry", async () => {
  const started = Promise.withResolvers<void>();
  const aborted = Promise.withResolvers<void>();
  const cleanup = Promise.withResolvers<void>();
  let claims = 0;
  let finished = 0;
  let retried = 0;
  let returned = false;
  const worker = startCanonicalAnalytics({
    outboxes: [
      {
        claim: async ({ sink, leaseId }) => {
          claims++;
          return {
            id: "synthetic",
            sink,
            leaseId,
            record: {
              analyticsEventId: "10000000-0000-4000-8000-000000000001",
              effectId: "synthetic",
              operationId: "10000000-0000-4000-8000-000000000002",
              operation: "test.commit",
              code: "SAVED",
              authority: "server_canonical",
              occurredAt: 1,
              reference: {
                contextId: "synthetic",
                revision: 1,
                policyVersion: 1,
                generation: "synthetic",
              },
            },
            mapping: {
              operation: "test.commit",
              successCodes: ["SAVED"],
              authority: "server_canonical",
              goal: "test_saved",
            },
          };
        },
        finish: async () => {
          finished++;
          return true;
        },
        retry: async () => {
          retried++;
        },
      },
    ],
    sinks: {
      [analyticsSinkNames.logOnly]: {
        name: "log_only",
        record: async (_event, signal) => {
          signal?.addEventListener("abort", () => aborted.resolve(), {
            once: true,
          });
          started.resolve();
          await cleanup.promise;
          return Result.Error("sink_unavailable");
        },
      },
    },
    clock: () => 1,
    permission: async () => "allowed",
    onError: () => {},
  });
  await started.promise;
  const closing = worker.close().then(() => {
    returned = true;
  });
  const watchdog = setTimeout(
    () => aborted.reject(new Error("Analytics shutdown did not abort sink")),
    100,
  );
  try {
    await aborted.promise;
    expect(returned).toBe(false);
    expect(retried).toBe(0);
  } finally {
    cleanup.resolve();
    clearTimeout(watchdog);
    await closing;
  }
  expect(claims).toBe(1);
  expect(retried).toBe(1);
  expect(finished).toBe(0);
});
