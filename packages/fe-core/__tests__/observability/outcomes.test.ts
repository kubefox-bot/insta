import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import {
  createBusinessObserver,
  createObservabilityService,
} from "../../src/observability/browser/index";
import { emitDiagnostic } from "../../src/observability/business/emit-diagnostic";
import { logFields } from "../../src/observability/contracts/conts";

test("rejected diagnostic and record sinks preserve the original Boxed business Result", async () => {
  const delivered = Promise.withResolvers<void>();
  const rejected = Promise.withResolvers<void>();
  const runtime = createObservabilityService({
    identity: {
      app: "insta",
      [logFields.serviceName]: "be-insta",
      source: "server",
    },
    uuid: crypto.randomUUID,
    clock: performance.now.bind(performance),
    context: () => ({}),
    adapters: [
      async () => {
        await rejected.promise;
        throw new Error("sink offline");
      },
    ],
  });
  const observer = createBusinessObserver({
    runtime,
    normalizeSuccess: (code) => ({
      code,
      retryable: false,
      [logFields.resultUnknown]: false,
    }),
    classifyFailure: () => ({ outcome: "failed" }),
    emit: async () => {
      delivered.resolve();
      await rejected.promise;
      throw new Error("diagnostics offline");
    },
  });
  const result = Result.Ok({ committed: true });
  const returned = await observer.observeOperation(
    "synthetic.commit",
    async () => result,
  );
  expect(returned).toBe(result);
  await delivered.promise;
  rejected.resolve();
  // Drain owned promise handlers using a microtask barrier rather than a sleep.
  await Promise.resolve();
  await Promise.resolve();
  expect(returned.isOk()).toBe(true);
  if (returned.isOk()) expect(returned.get()).toEqual({ committed: true });
});

test("adapted upstream diagnostic fixture retains synchronous invocation and isolates rejection", async () => {
  const received: string[] = [];
  const barrier = Promise.withResolvers<void>();
  emitDiagnostic(
    async (record) => {
      received.push(record.type);
      await barrier.promise;
      throw new Error("diagnostic unavailable");
    },
    {
      type: "violation",
      operation: "fixture",
      [logFields.operationId]: crypto.randomUUID(),
      code: "missing_outcome",
    },
  );
  expect(received).toEqual(["violation"]);
  barrier.resolve();
  await Promise.resolve();
});
