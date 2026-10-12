import { expect, test } from "bun:test";
import {
  decideRequest,
  decideVerification,
} from "../../../apps/be-insta/src/domains/users/auth/domain/registration/decide";

const now = 1900000000000;
const challenge = {
  challengeId: "opaque",
  registrationExpiresAt: now + 86400000,
  nextSendAt: now + 60000,
  errors: 4,
  version: "first",
  consumed: false,
};
test("resend preserves original deadline and accumulated errors", () => {
  const result = decideRequest({ previous: challenge, now: now + 60000 });
  if (result.isError()) throw new Error(result.getError());
  expect(result.get()).toEqual({
    registrationExpiresAt: now + 86400000,
    errors: 4,
  });
});
test("cooldown applies to consumed and unconsumed challenges", () => {
  for (const consumed of [false, true])
    expect(
      decideRequest({
        previous: { ...challenge, consumed },
        now: now + 1,
      }).toJSON(),
    ).toMatchObject({ tag: "Error", error: "RESEND_COOLDOWN" });
});
test("deadline is exclusive and sixth attempt cannot authenticate even with correct code", () => {
  expect(
    decideVerification({
      challenge,
      now: challenge.registrationExpiresAt,
      matches: true,
    }).toJSON(),
  ).toMatchObject({ tag: "Error", error: "REGISTRATION_EXPIRED" });
  expect(
    decideVerification({
      challenge: { ...challenge, errors: 5 },
      now,
      matches: true,
    }).toJSON(),
  ).toMatchObject({ tag: "Error", error: "CODE_EXHAUSTED" });
});
test("wrong and consumed codes cannot grant proof", () => {
  expect(
    decideVerification({ challenge, now, matches: false }).toJSON(),
  ).toMatchObject({ tag: "Error", error: "CODE_INVALID" });
  expect(
    decideVerification({
      challenge: { ...challenge, consumed: true },
      now,
      matches: true,
    }).toJSON(),
  ).toMatchObject({ tag: "Error", error: "CODE_INVALID" });
});
