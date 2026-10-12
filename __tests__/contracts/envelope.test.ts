import { expect, test } from "bun:test";
import { commonErrorSchema, envelopeSchema } from "@insta/contracts/http";
import { z } from "zod";

const meta = { requestId: "ab6c77d6-fbd6-4d22-9780-84a6e284cde9" };
const schema = envelopeSchema(z.null(), commonErrorSchema);
test("HTTP envelope requires one branch and correlation, preserving null", () => {
  expect(schema.safeParse({ ok: true, data: null, meta }).success).toBe(true);
  expect(
    schema.safeParse({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Unavailable" },
      meta,
    }).success,
  ).toBe(true);
  for (const payload of [
    { ok: true, meta },
    { ok: false, meta },
    {
      ok: true,
      data: null,
      error: { code: "INTERNAL_ERROR", message: "x" },
      meta,
    },
    {
      ok: false,
      data: null,
      error: { code: "INTERNAL_ERROR", message: "x" },
      meta,
    },
    { ok: true, data: null },
    { ok: true, data: null, meta: { requestId: "bad" } },
    { ok: false, error: { code: "UNKNOWN", message: "x" }, meta },
  ])
    expect(schema.safeParse(payload).success).toBe(false);
});
