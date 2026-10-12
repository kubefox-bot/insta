import { describe, expect, it } from "bun:test";
import { createObservabilityService } from "../../../src/observability/browser/index";
import type { BusinessDiagnosticRecord } from "../../../src/observability/business/index";
import { createBusinessObserver } from "../../../src/observability/business/index";
import { logFields } from "../../../src/observability/contracts/conts";
import expected from "./expected-events.json";

const operationId = "11111111-1111-4111-8111-111111111111";

const createHarness = (options?: {
  emitThrows?: boolean;
  classifyThrows?: boolean;
}) => {
  const logs: Record<string, unknown>[] = [];
  const diagnostics: BusinessDiagnosticRecord[] = [];
  const runtime = createObservabilityService({
    identity: {
      app: "hap",
      [logFields.serviceName]: "fe-hap",
      source: "browser",
    },
    clock: () => 1_000,
    uuid: () => operationId,
    context: () => ({}),
    config: { authority: "client_observed" },
    adapters: [
      (record) => {
        logs.push(record);
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
    classifyFailure: (error) => {
      if (options?.classifyThrows) throw new Error("classifier failed");
      const value = error as {
        code?: string;
        correlation?: { [logFields.operationId]?: string };
      };
      const code = value?.code ?? "INTERNAL_ERROR";
      return {
        outcome:
          code === "INVALID_CREDENTIALS"
            ? ("rejected" as const)
            : ("failed" as const),
        result: {
          code,
          retryable: false,
          [logFields.resultUnknown]: code !== "INVALID_CREDENTIALS",
        },
        correlation: value?.correlation,
      };
    },
    emit: (record) => {
      if (options?.emitThrows) throw new Error("sink failed");
      diagnostics.push(record);
    },
  });
  return { observer, logs, diagnostics };
};

const business = (record: Record<string, unknown>) =>
  record.business as Record<string, unknown>;

describe("business observer", () => {
  it("uses one portable operation for start, adopted ID and terminal success", async () => {
    const { observer, logs } = createHarness();
    const accepted = "99999999-9999-4999-8999-999999999999";
    const value = await observer.observeOperation(
      "login",
      async (operation) => {
        expect(operation.id).toBe(operationId);
        operation.adopt(accepted);
        operation.succeeded("LOGIN_SUCCEEDED");
        return "confirmed";
      },
    );

    expect(value).toBe("confirmed");
    expect(logs).toHaveLength(2);
    expect(logs[0]?.operation_id).toBe(expected.started.operation_id);
    expect(business(logs[0] ?? {}).outcome).toBe("attempted");
    expect(logs[1]?.operation_id).toBe(accepted);
    expect(business(logs[1] ?? {})).toMatchObject({
      operation: "login",
      outcome: "succeeded",
      code: "LOGIN_SUCCEEDED",
      retryable: false,
      [logFields.resultUnknown]: false,
    });
  });

  it("adopts a later request and active trace without replacing the operation ID", async () => {
    const { observer, logs } = createHarness();
    await observer.observeOperation("login", async (operation) => {
      operation.correlate({
        [logFields.requestId]: "22222222-2222-4222-8222-222222222222",
        [logFields.traceId]: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        [logFields.spanId]: "bbbbbbbbbbbbbbbb",
      });
      operation.succeeded("LOGIN_SUCCEEDED");
    });
    expect(logs.at(-1)).toMatchObject({
      [logFields.operationId]: operationId,
      [logFields.requestId]: "22222222-2222-4222-8222-222222222222",
      [logFields.traceId]: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      [logFields.spanId]: "bbbbbbbbbbbbbbbb",
    });
  });

  it("keeps app-owned retryability on a resolved failure DTO", async () => {
    const { observer, logs } = createHarness();
    await observer.observeOperation("news.related_smi", async (operation) => {
      operation.failed(undefined, "RELATED_SMI_REQUEST_FAILED", {
        code: "RELATED_SMI_REQUEST_FAILED",
        retryable: true,
        [logFields.resultUnknown]: true,
      });
    });
    expect(business(logs.at(-1) ?? {})).toMatchObject({
      outcome: "failed",
      code: "RELATED_SMI_REQUEST_FAILED",
      retryable: true,
      [logFields.resultUnknown]: true,
    });
  });

  it("reports missing outcome without inventing a terminal event", async () => {
    const { observer, logs, diagnostics } = createHarness();
    await observer.observeOperation("login", async () => "returned");

    expect(logs).toHaveLength(1);
    expect(diagnostics).toEqual([
      expect.objectContaining(expected.missingOutcome),
    ]);
  });

  it("reports a second completion without replacing the first", async () => {
    const { observer, logs, diagnostics } = createHarness();
    await observer.observeOperation("login", async (operation) => {
      operation.succeeded("LOGIN_SUCCEEDED");
      operation.failed(new Error("late"), "INTERNAL_ERROR");
    });

    expect(logs).toHaveLength(2);
    expect(business(logs[1] ?? {}).outcome).toBe("succeeded");
    expect(diagnostics).toEqual([
      {
        type: "violation",
        operation: "login",
        [logFields.operationId]: operationId,
        code: "multi_completion",
      },
    ]);
  });

  it("classifies rejection and preserves the thrown error identity", async () => {
    const { observer, logs } = createHarness();
    const error = { code: "INVALID_CREDENTIALS" };

    await expect(
      observer.observeOperation("login", async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(business(logs.at(-1) ?? {})).toMatchObject({
      outcome: "rejected",
      code: "INVALID_CREDENTIALS",
      [logFields.resultUnknown]: false,
    });
  });

  it("adopts every correlation field from a classified failure", async () => {
    const { observer, logs } = createHarness();
    const accepted = "99999999-9999-4999-8999-999999999999";
    const error = {
      code: "INVALID_CREDENTIALS",
      correlation: {
        [logFields.operationId]: accepted,
        [logFields.requestId]: "22222222-2222-4222-8222-222222222222",
        [logFields.traceId]: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        [logFields.spanId]: "bbbbbbbbbbbbbbbb",
      },
    };

    await expect(
      observer.observeOperation("login", async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(logs.at(-1)).toMatchObject(error.correlation);
  });

  it("uses the actual failure status when deriving result uncertainty", async () => {
    const { observer, logs } = createHarness();
    await observer.observeOperation("login", async (operation) => {
      operation.failed({ code: "INVALID_UPSTREAM_RESPONSE", status: 400 });
    });

    expect(business(logs.at(-1) ?? {})).toMatchObject({
      outcome: "failed",
      code: "INVALID_UPSTREAM_RESPONSE",
      [logFields.resultUnknown]: false,
    });
  });

  it("uses a technical fallback when failure classification throws", async () => {
    const { observer, logs } = createHarness({
      classifyThrows: true,
      emitThrows: true,
    });
    const error = new Error("backend failed");

    await expect(
      observer.observeOperation("login", async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(business(logs.at(-1) ?? {}).outcome).toBe("failed");
    expect(business(logs.at(-1) ?? {}).code).toBeUndefined();
  });

  it("keeps a confirmed success when telemetry normalization throws", async () => {
    const logs: Record<string, unknown>[] = [];
    const observer = createBusinessObserver({
      runtime: createObservabilityService({
        identity: {
          app: "hap",
          [logFields.serviceName]: "fe-hap",
          source: "browser",
        },
        clock: () => 1_000,
        uuid: () => operationId,
        context: () => ({}),
        adapters: [
          (record) => {
            logs.push(record);
          },
        ],
      }),
      normalizeSuccess: () => {
        throw new Error("normalizer failed");
      },
      classifyFailure: () => ({ outcome: "failed" }),
      emit: () => undefined,
    });

    const value = await observer.observeOperation(
      "login",
      async (operation) => {
        operation.succeeded("LOGIN_SUCCEEDED");
        return "confirmed";
      },
    );

    expect(value).toBe("confirmed");
    expect(business(logs.at(-1) ?? {})).toMatchObject({
      outcome: "succeeded",
      code: "LOGIN_SUCCEEDED",
    });
  });

  it("gives each manual retry a new operation ID", async () => {
    let nextId = 1;
    const ids: string[] = [];
    const runtime = createObservabilityService({
      identity: {
        app: "hap",
        [logFields.serviceName]: "fe-hap",
        source: "browser",
      },
      clock: () => 1_000,
      uuid: () =>
        `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
      context: () => ({}),
    });
    const observer = createBusinessObserver({
      runtime,
      normalizeSuccess: (code) => ({
        code,
        retryable: false,
        [logFields.resultUnknown]: false,
      }),
      classifyFailure: () => ({ outcome: "failed" }),
      emit: () => undefined,
    });
    await observer.observeOperation("login", async (operation) => {
      ids.push(operation.id);
      operation.pending();
    });
    await observer.observeOperation("login", async (operation) => {
      ids.push(operation.id);
      operation.pending();
    });

    expect(ids).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ]);
  });
});
