import { describe, expect, it } from "bun:test";
import { createObservabilityService } from "../../../src/observability/browser/index";
import type { BusinessDiagnosticRecord } from "../../../src/observability/business/index";
import { createBusinessObserver } from "../../../src/observability/business/index";
import { logFields } from "../../../src/observability/contracts/conts";

describe("runConfirmedEffect", () => {
  it("waits for a failed effect, records it and leaves confirmed success intact", async () => {
    const records: BusinessDiagnosticRecord[] = [];
    const runtime = createObservabilityService({
      identity: {
        app: "hap",
        [logFields.serviceName]: "fe-hap",
        source: "browser",
      },
      clock: () => 1_000,
      uuid: () => "11111111-1111-4111-8111-111111111111",
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
      emit: (record) => {
        records.push(record);
      },
    });
    const failure = new Error("UI effect failed");
    const result = await observer.observeOperation(
      "login",
      async (operation) => {
        operation.succeeded("LOGIN_SUCCEEDED");
        await observer.runConfirmedEffect(
          async () => {
            throw failure;
          },
          "login",
          operation.id,
        );
        return "confirmed";
      },
    );

    expect(result).toBe("confirmed");
    expect(records).toEqual([
      {
        type: "frontend_failure",
        operation: "login",
        [logFields.operationId]: "11111111-1111-4111-8111-111111111111",
        phase: "post_confirmation",
        code: "FRONTEND_UI_EFFECT_FAILED",
        error: failure,
      },
    ]);
  });
});
