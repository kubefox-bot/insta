import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { correlationSchema, readCorrelation } from "@insta/contracts/http";
import { resultResponse } from "../../apps/be-insta/src/lib/http/result-response";

const requestId = "ab6c77d6-fbd6-4d22-9780-84a6e284cde9";
test("HTTP correlation accepts each validated ID independently and creates missing request ID", () => {
  expect(
    readCorrelation({ "x-request-id": requestId, "x-operation-id": "invalid" }),
  ).toEqual({ requestId });
  expect(
    correlationSchema.safeParse(readCorrelation({ "x-request-id": "bad" }))
      .success,
  ).toBe(true);
  expect(readCorrelation({}).requestId).not.toBe(readCorrelation({}).requestId);
});
test("HTTP maps Boxed outcomes once with preserved original meta and null", () => {
  expect(
    resultResponse({ result: Result.Ok(null), meta: { requestId } }),
  ).toEqual({ ok: true, data: null, meta: { requestId } });
  expect(
    resultResponse({
      result: Result.Error({ code: "INTERNAL_ERROR", message: "safe" }),
      meta: { requestId },
    }),
  ).toEqual({
    ok: false,
    error: { code: "INTERNAL_ERROR", message: "safe" },
    meta: { requestId },
  });
});
