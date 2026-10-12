import { expect, test } from "bun:test";
import {
  registrationCompleteSchema,
  registrationStartSchema,
  registrationStartSuccessSchema,
} from "../../apps/be-insta/src/domains/users/auth/adapters/http/registration.dto";
import { completeRegistrationMutationRequestSchema } from "../../apps/fe-insta/src/lib/api/generated/schemas/completeRegistrationSchema";
import {
  startRegistration200Schema,
  startRegistrationMutationRequestSchema,
} from "../../apps/fe-insta/src/lib/api/generated/schemas/startRegistrationSchema";

for (const [name, schema, input] of [
  [
    "source start",
    registrationStartSchema,
    { email: "synthetic@example.test" },
  ],
  [
    "generated start",
    startRegistrationMutationRequestSchema,
    { email: "synthetic@example.test" },
  ],
  [
    "source complete",
    registrationCompleteSchema,
    { proof: "proof", username: "Synthetic", password: "synthetic-password" },
  ],
  [
    "generated complete",
    completeRegistrationMutationRequestSchema,
    { proof: "proof", username: "Synthetic", password: "synthetic-password" },
  ],
] as const) {
  test(`${name} requires an operation ID compatible with its response`, () => {
    for (const operationId of [
      undefined,
      "00000000-0000-1000-8000-000000000001",
      "00000000-0000-0000-0000-000000000000",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
    ])
      expect(schema.safeParse({ ...input, operationId }).success).toBe(false);
    expect(
      schema.safeParse({
        ...input,
        operationId: "00000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(true);
  });
}
test("accepted v4 operation ID round trips through source and generated success envelopes", () => {
  const input = registrationStartSchema.parse({
    email: "synthetic@example.test",
    operationId: "00000000-0000-4000-8000-000000000001",
  });
  const envelope = {
    ok: true,
    data: { challengeId: "a".repeat(64), registrationExpiresAt: 1900000000000 },
    meta: { requestId: crypto.randomUUID(), operationId: input.operationId },
  };
  expect(registrationStartSuccessSchema.safeParse(envelope).success).toBe(true);
  expect(startRegistration200Schema.safeParse(envelope).success).toBe(true);
});
