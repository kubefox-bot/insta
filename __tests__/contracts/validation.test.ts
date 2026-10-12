import { expect, test } from "bun:test";
import { validationErrorSchema } from "@insta/contracts/http";
import { createValidationException } from "../../apps/be-insta/src/lib/http/validation-error";

test("native validation adapter preserves field paths while excluding values and unsafe issue messages", () => {
  const exception = createValidationException([
    { path: ["password"], message: "SYNTHETIC_SECRET_INPUT" },
  ]);
  const error = validationErrorSchema.parse(exception.getResponse());
  expect(exception.getStatus()).toBe(400);
  expect(error.details.issues).toEqual([
    { path: ["password"], code: "INVALID_VALUE", message: "Invalid value" },
  ]);
  expect(JSON.stringify(error)).not.toContain("SYNTHETIC_SECRET_INPUT");
});
