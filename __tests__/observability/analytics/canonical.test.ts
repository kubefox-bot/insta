import { expect, test } from "bun:test";
import { canonicalAuthEvent } from "../../../apps/be-insta/src/domains/users/auth/business/canonical";

test("separate committed auth effects share an operation but never a conversion identity", () => {
  const input = {
    kind: "login" as const,
    operationId: crypto.randomUUID(),
    backendSessionId: crypto.randomUUID(),
    committedAt: Date.now(),
  };
  const first = canonicalAuthEvent(input);
  const second = canonicalAuthEvent({
    ...input,
    backendSessionId: crypto.randomUUID(),
  });
  expect(new Set([first.analyticsEventId, second.analyticsEventId]).size).toBe(
    2,
  );
});
