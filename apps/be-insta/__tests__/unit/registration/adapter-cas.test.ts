import { expect, test } from "bun:test";
import type { RedisClient } from "bun";
import { createDragonflyChallenges } from "../../../src/domains/users/auth/adapters/registration/dragonfly/challenges";

const challenge = {
  challengeId: "same-email",
  registrationExpiresAt: 2_000_000,
  nextSendAt: 0,
  errors: 0,
  version: "old-instance",
  consumed: false,
  codeDigest: "digest",
  ciphertext: "ciphertext",
  revision: 1,
} as const;

const createClient = (reply: unknown) => {
  const calls: string[][] = [];
  const client = {
    send: async (_command: string, scriptArgs: string[]) => {
      calls.push(scriptArgs);
      return calls.length % 2 === 1 ? "generation" : reply;
    },
  } as RedisClient;
  return { client, calls };
};

test("enqueue passes the previously read challenge version into the atomic script", async () => {
  const { client, calls } = createClient("REGISTRATION_CONFLICT");
  const challenges = createDragonflyChallenges({ client });
  await challenges.enqueue({
    expected: challenge,
    challenge: { ...challenge, version: "replacement", revision: 2 },
    operationId: "operation",
    mailPayload: "mail",
    now: 1_000_000,
  });
  expect(calls[1]?.at(-1)).toBe("old-instance");
});

test("verify passes the previously read challenge version into the atomic script", async () => {
  const { client, calls } = createClient(["REGISTRATION_CONFLICT"]);
  const challenges = createDragonflyChallenges({ client });
  await challenges.verify({
    expected: challenge,
    matches: true,
    now: 1_000_000,
  });
  expect(calls[1]?.at(-1)).toBe("old-instance");
});
