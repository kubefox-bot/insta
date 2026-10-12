import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import type { AuthLimits } from "../../../apps/be-insta/src/domains/users/ports/auth-limits";
import { admitAuthMutation } from "../../../apps/be-insta/src/domains/users/use-cases/admit-mutation";

test("mutation checks canonical email and trusted source independently; outage closes admission", async () => {
  const calls: unknown[] = [];
  const limits: AuthLimits = {
    consume: async (input) => {
      calls.push(input);
      return input.limit === "otpIp"
        ? Result.Error("unavailable")
        : Result.Ok({ state: "allowed" });
    },
    recordChallengeError: async () => Result.Ok({ state: "allowed" }),
  };
  const result = await admitAuthMutation(
    {
      mutation: "otp",
      email: " Alice@Example.TEST ",
      source: "trusted-source",
    },
    { limits },
  );
  expect(result.isError() && result.getError()).toEqual({
    state: "unavailable",
  });
  expect(calls).toEqual([
    { limit: "otpEmail", subject: "alice@example.test" },
    { limit: "otpIp", subject: "trusted-source" },
  ]);
});
test("denied email still counts source quota and preserves Retry-After", async () => {
  const calls: string[] = [];
  const limits: AuthLimits = {
    consume: async ({ limit }) => {
      calls.push(limit);
      return Result.Ok({
        state: "limited",
        retryAfterSeconds: limit === "loginEmail" ? 300 : 900,
      });
    },
    recordChallengeError: async () => Result.Ok({ state: "allowed" }),
  };
  const result = await admitAuthMutation(
    {
      mutation: "login",
      email: "synthetic@example.test",
      source: "trusted-source",
    },
    { limits },
  );
  expect(result.isError() && result.getError()).toEqual({
    state: "limited",
    retryAfterSeconds: 900,
  });
  expect(calls).toEqual(["loginEmail", "loginIp"]);
});
