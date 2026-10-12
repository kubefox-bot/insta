import { expect } from "bun:test";
import { decodeJwt, SignJWT } from "jose";
import { readTestApiConfig } from "../../../../../__tests__/fixtures/environment";
import { setupFailure } from "../../../../../__tests__/fixtures/lifecycle/setup-failure";
import { createRegistrationEnvironment } from "../../../../../__tests__/fixtures/registration/environment";
import { createApplication } from "../../../src/app/bootstrap";
import { login } from "../../../src/domains/users/auth/index";

const fixture = await createRegistrationEnvironment();
const app = await createApplication(
  {
    users: fixture.users,
    checkRequired: async () => true,
    check: async () => ({ ready: true, mail: "ok", delivery: "ok" }),
    close: async () => {},
  },
  { mode: "offline" },
).catch(async (error: unknown) => {
  try {
    await fixture.dispose();
  } catch (cleanupError) {
    throw setupFailure({
      error,
      cleanupError,
      message: "Credential probe startup and cleanup failed",
    });
  }
  throw error;
});
try {
  await app.listen(0, "127.0.0.1");
  const url = await app.getUrl();
  const account = await fixture.account();
  const logged = await login(
    { ...account, operationId: fixture.operation() },
    fixture.auth,
  );
  if (logged.isError()) throw new Error(logged.getError());
  const valid = logged.get().credentials.accessToken;
  const claims = decodeJwt(valid);
  const key = Buffer.from(readTestApiConfig().authSigningKey, "hex");
  const wrongAudience = await new SignJWT({
    ...claims,
    aud: "foreign-service",
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(key);
  const badSignature = await new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .sign(crypto.getRandomValues(new Uint8Array(32)));
  const pending = await fixture.pending();
  const before = {
    sessions: await fixture.db.collection("users_sessions").countDocuments({
      backendSessionId: logged.get().credentials.backendSessionId,
    }),
    pending: await fixture.db
      .collection("users")
      .findOne({ emailKey: pending.email.toLowerCase() }),
    messages: await fixture.db
      .collection("conversations_messages")
      .countDocuments({ actorId: logged.get().credentials.user.id }),
  };
  for (const token of [
    wrongAudience,
    badSignature,
    pending.registrationProof,
  ]) {
    const response = await fetch(`${url}/v1/me`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("ACCESS_TOKEN_INVALID");
  }
  expect(
    await fixture.db.collection("users_sessions").countDocuments({
      backendSessionId: logged.get().credentials.backendSessionId,
    }),
  ).toBe(before.sessions);
  expect(
    await fixture.db
      .collection("users")
      .findOne({ emailKey: pending.email.toLowerCase() }),
  ).toEqual(before.pending);
  expect(
    await fixture.db
      .collection("conversations_messages")
      .countDocuments({ actorId: logged.get().credentials.user.id }),
  ).toBe(before.messages);
  expect(before.sessions).toBe(1);
  expect(before.pending?.status).toBe("pending_setup");
} finally {
  await app.close();
  await fixture.dispose();
}
console.log(
  JSON.stringify({
    nativeCredentialBoundary: "passed",
    persistedEffectChanges: 0,
  }),
);
