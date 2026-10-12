import { expect, test } from "bun:test";
import { decodeSupportFailure } from "../../../apps/fe-insta/src/domains/support-reports/browser/decode-failure";
import {
  needsNewScope,
  submissionPayload,
} from "../../../apps/fe-insta/src/domains/support-reports/domain/submission";

test("unknown report replay retains immutable entire payload despite edited draft, changed issue and replacement scope", () => {
  const original = submissionPayload({
    attempt: { kind: "idle" },
    scopeId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    comment: "original draft",
    issue: {
      errorCode: "PRIVATE_CLEANUP_FAILED",
      originalRequestId: crypto.randomUUID(),
    },
  });
  const retry = submissionPayload({
    attempt: {
      kind: "failed",
      payload: original,
      failure: "unknown",
      uncertain: true,
    },
    scopeId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    comment: "edited draft",
    issue: {
      errorCode: "TECHNICAL_PROBLEM",
      originalRequestId: crypto.randomUUID(),
    },
  });
  expect(Object.isFrozen(original)).toBe(true);
  expect(retry).toBe(original);
  expect(retry.comment).toBe("original draft");
  expect(retry.errorCode).toBe("PRIVATE_CLEANUP_FAILED");
  expect(
    needsNewScope({
      kind: "failed",
      payload: original,
      failure: "unknown",
      uncertain: true,
    }),
  ).toBe(false);
  for (const failure of ["contextInvalid", "actorChanged"] as const)
    expect(
      needsNewScope({
        kind: "failed",
        payload: original,
        failure,
        uncertain: true,
      }),
    ).toBe(true);
});
test("web failure boundary distinguishes context/actor and keeps unavailable or malformed outcome unknown", () => {
  const meta = { requestId: crypto.randomUUID() };
  const error = (code: string) => ({ ok: false, error: { code }, meta });
  expect(decodeSupportFailure(error("SUPPORT_CONTEXT_INVALID"))).toBe(
    "contextInvalid",
  );
  expect(decodeSupportFailure(error("ACTOR_CHANGED"))).toBe("actorChanged");
  expect(decodeSupportFailure(error("SUPPORT_UNAVAILABLE"))).toBe("unknown");
  expect(decodeSupportFailure(error("NEW_SERVER_CODE"))).toBe("unknown");
  expect(decodeSupportFailure({ code: "ACTOR_CHANGED" })).toBe("unknown");
});
