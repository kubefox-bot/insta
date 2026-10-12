import { expect, test } from "bun:test";
import { z } from "zod";
import { loginSchema as backend } from "../../apps/be-insta/src/domains/users/auth/adapters/http/session.dto";
import { validPassword } from "../../apps/be-insta/src/domains/users/domain/policy";
import { loginMutationRequestSchema as generated } from "../../apps/fe-insta/src/lib/api/generated/schemas/loginSchema";

test("source validator JSON Schema and generated Zod preserve password Unicode scalar limits and exact paste", () => {
  const json = z.toJSONSchema(backend);
  const password = json.properties?.password;
  if (
    !password ||
    typeof password !== "object" ||
    typeof password.pattern !== "string"
  )
    throw new Error("Missing password source constraint");
  expect(password.minLength).toBe(12);
  expect(password.maxLength).toBe(128);
  for (const [value, valid] of [
    ["😀".repeat(128), true],
    ["😀".repeat(129), false],
    ["😀".repeat(12), true],
    ["😀".repeat(11), false],
    [`${"x".repeat(127)}\n`, true],
    [`${"x".repeat(128)}\n`, false],
    [" pasted password \n", true],
    [`${"x".repeat(12)}\ud800`, false],
    [`${"x".repeat(12)}\udfff`, false],
  ] as const) {
    const input = { email: "synthetic@example.test", password: value };
    expect(validPassword(value)).toBe(valid);
    expect(backend.safeParse(input).success).toBe(valid);
    expect(generated.safeParse(input).success).toBe(valid);
    expect(new RegExp(password.pattern, "u").test(value)).toBe(valid);
    if (valid) expect(backend.parse(input).password).toBe(value);
  }
});

test("generated auth failure accepts the actual safe validation details envelope", async () => {
  const { login400Schema } = await import(
    "../../apps/fe-insta/src/lib/api/generated/schemas/loginSchema"
  );
  expect(
    login400Schema.safeParse({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Request validation failed",
        details: {
          issues: [
            {
              path: ["password"],
              code: "INVALID_VALUE",
              message: "Invalid value",
            },
          ],
        },
      },
      meta: { requestId: crypto.randomUUID() },
    }).success,
  ).toBe(true);
});
