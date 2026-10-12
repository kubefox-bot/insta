import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { unavailableAuth } from "../../../src/app/composition/users/unavailable";
import { createBunHasher } from "../../../src/domains/users/adapters/passwords/bun-hasher";
import { dummyPasswordHash } from "../../../src/domains/users/adapters/passwords/conts";
import type { Account } from "../../../src/domains/users/auth/domain/types";
import { login } from "../../../src/domains/users/auth/use-cases/login";
import {
  PasswordAdmissionError,
  type SessionId,
  type UserId,
} from "../../../src/domains/users/index";
import { createAdmissionHttpFixture } from "./http-fixture";

const input = {
  email: "synthetic@example.test",
  password: "Valid-fixture-password1!",
  operationId: "login-fixture",
};
const account: Account = {
  id: "000000000000000000000001" as UserId,
  username: "synthetic",
  passwordHash: "real-hash",
};

for (const found of [null, account]) {
  test(`login admits exactly once for ${found ? "known" : "unknown"} account`, async () => {
    const calls: unknown[] = [];
    const auth = {
      ...unavailableAuth,
      sessions: { ...unavailableAuth.sessions, findAccount: async () => found },
      passwords: {
        ...unavailableAuth.passwords,
        verify: async (value: unknown) => {
          calls.push(value);
          return false;
        },
      },
    };
    const result = await login(input, auth);
    expect(calls).toEqual([
      { password: input.password, hash: found?.passwordHash },
    ]);
    expect(result.isError()).toBe(true);
    if (result.isError())
      expect(String(result.getError())).toBe("INVALID_CREDENTIALS");
  });
  test(`saturated ${found ? "known" : "unknown"} login has the same isolated HTTP outcome`, async () => {
    const auth = {
      ...unavailableAuth,
      sessions: { ...unavailableAuth.sessions, findAccount: async () => found },
      passwords: {
        ...unavailableAuth.passwords,
        verify: async () => {
          throw new PasswordAdmissionError();
        },
      },
    };
    const fixture = await createAdmissionHttpFixture(async () => {
      await login(input, auth);
    });
    try {
      const response = await fetch(fixture.url);
      expect(response.status).toBe(503);
      expect(response.headers.get("Retry-After")).toBe("2");
    } finally {
      await fixture.close();
    }
  });
}

test("unknown account cannot issue credentials even when verifier matches", async () => {
  const auth = {
    ...unavailableAuth,
    sessions: { ...unavailableAuth.sessions, findAccount: async () => null },
    passwords: { ...unavailableAuth.passwords, verify: async () => true },
  };
  const result = await login(input, auth);
  expect(result.isError()).toBe(true);
});

test("invalid password bypasses account lookup and admission", async () => {
  const result = await login({ ...input, password: "" }, unavailableAuth);
  expect(result.isError()).toBe(true);
});

test("database failure stays a failure before password admission", async () => {
  const failure = new Error("Synthetic database unavailable");
  const auth = {
    ...unavailableAuth,
    sessions: {
      ...unavailableAuth.sessions,
      findAccount: async () => {
        throw failure;
      },
    },
  };
  await expect(login(input, auth)).rejects.toBe(failure);
});

test("valid real account issues a session", async () => {
  const issued: unknown[] = [];
  const auth = {
    ...unavailableAuth,
    clock: () => 100,
    sessionId: () => "synthetic-session" as SessionId,
    tokens: {
      ...unavailableAuth.tokens,
      secret: () => "synthetic-secret",
      digest: () => "synthetic-digest",
      issueAccess: async () => "synthetic-access",
    },
    sessions: {
      ...unavailableAuth.sessions,
      findAccount: async () => account,
      issue: async (value: unknown) => {
        issued.push(value);
        return Result.Ok({ operationId: input.operationId });
      },
    },
    passwords: { ...unavailableAuth.passwords, verify: async () => true },
  };
  const result = await login(input, auth);
  expect(result.isOk()).toBe(true);
  expect(issued).toHaveLength(1);
});

test("Bun adapter absent hash executes dummy work and returns false", async () => {
  const hasher = createBunHasher();
  expect(await hasher.verify({ password: input.password })).toBe(false);
});

test("matching dummy password remains invalid for an unknown account", async () => {
  expect(
    await Bun.password.verify(input.password, dummyPasswordHash, "argon2id"),
  ).toBe(true);
  const hasher = createBunHasher();
  const auth = {
    ...unavailableAuth,
    sessions: { ...unavailableAuth.sessions, findAccount: async () => null },
    passwords: hasher,
  };
  const result = await login(input, auth);
  expect(result.isError()).toBe(true);
  if (result.isError())
    expect(String(result.getError())).toBe("INVALID_CREDENTIALS");
});

test("real hash verifies matching and wrong passwords independently", async () => {
  const hasher = createBunHasher();
  const hash = await hasher.hash({ password: input.password });
  expect(await hasher.verify({ password: input.password, hash })).toBe(true);
  expect(
    await hasher.verify({ password: "Different-fixture-password1!", hash }),
  ).toBe(false);
  expect(await hasher.verify({ password: "" })).toBe(false);
});
