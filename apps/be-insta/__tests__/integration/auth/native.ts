import { expect } from "bun:test";
import { createAuthEnvironment } from "../../../../../__tests__/fixtures/users/auth-environment";
import {
  login200Schema,
  login400Schema,
  login429Schema,
} from "../../../../../apps/fe-insta/src/lib/api/generated/schemas/loginSchema";
import { refresh200Schema } from "../../../../../apps/fe-insta/src/lib/api/generated/schemas/refreshSchema";
import { createApplication } from "../../../src/app/bootstrap";
import {
  refreshCredentialsSchema,
  sessionCredentialsSchema,
} from "../../../src/domains/users/auth/domain/credentials";

const f = await createAuthEnvironment();
const app = await createApplication(
  {
    users: f.users,
    checkRequired: async () => true,
    check: async () => ({ ready: true, mail: "ok", delivery: "ok" }),
    close: async () => {},
  },
  { mode: "offline" },
);
try {
  await app.listen(0, "127.0.0.1");
  const url = await app.getUrl();
  const post = (
    path: string,
    body: unknown,
    headers: Readonly<Record<string, string>> = {},
  ) =>
    fetch(`${url}/v1/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  const account = await f.account("😀".repeat(128));
  const result = await post("auth/login", account);
  expect(result.status).toBe(200);
  const body = login200Schema.parse(await result.json());
  const credentials = sessionCredentialsSchema.parse(body.data);
  const me = await fetch(`${url}/v1/me`, {
    headers: { authorization: `Bearer ${credentials.accessToken}` },
  });
  expect(me.status).toBe(200);
  expect((await me.json()).data.id).toBe(credentials.user.id);
  for (const password of [
    "😀".repeat(129),
    `${"x".repeat(128)}\n`,
    `${"x".repeat(12)}\ud800`,
  ]) {
    const rejected = await post("auth/login", { ...account, password });
    expect(rejected.status).toBe(400);
    expect(login400Schema.parse(await rejected.json()).error.code).toBe(
      "VALIDATION_FAILED",
    );
  }
  const pasted = await f.account(" pasted password \n");
  const pasteResult = await post("auth/login", pasted);
  expect(pasteResult.status).toBe(200);
  const pasteCredentials = sessionCredentialsSchema.parse(
    (await pasteResult.json()).data,
  );
  const trimmed = await post("auth/login", {
    ...pasted,
    password: pasted.password.trim(),
  });
  expect(trimmed.status).toBe(401);
  expect((await trimmed.json()).error.code).toBe("INVALID_CREDENTIALS");
  const key = crypto.randomUUID();
  const rotate = await post(
    "auth/refresh",
    { refreshToken: credentials.refreshToken },
    { "X-Idempotency-Key": key },
  );
  expect(rotate.status).toBe(200);
  const rotatedBody = refresh200Schema.parse(await rotate.json());
  const rotated = refreshCredentialsSchema.parse(rotatedBody.data);
  expect(rotated).not.toHaveProperty("revokeSecret");
  const repeat = await post(
    "auth/refresh",
    { refreshToken: credentials.refreshToken },
    { "X-Idempotency-Key": key },
  );
  const replayed = await repeat.json();
  expect(replayed.data).toEqual(rotated);
  expect(replayed.meta.operationId).toBe(rotatedBody.meta.operationId);
  expect(replayed.meta.requestId).not.toBe(rotatedBody.meta.requestId);
  const loggedOut = await post("auth/sessions/revoke", {
    backendSessionId: credentials.backendSessionId,
    revokeSecret: credentials.revokeSecret,
  });
  expect(loggedOut.status).toBe(200);
  await loggedOut.body?.cancel();
  const forbidden = await fetch(`${url}/v1/me`, {
    headers: { authorization: `Bearer ${rotated.accessToken}` },
  });
  expect(forbidden.status).toBe(401);
  expect((await forbidden.json()).error.code).toBe("SESSION_REVOKED");
  const confirmed = await post("auth/sessions/revoke", {
    backendSessionId: credentials.backendSessionId,
    revokeSecret: credentials.revokeSecret,
  });
  expect(confirmed.status).toBe(200);
  expect((await confirmed.json()).data.state).toBe("revoked");
  f.advance(900000);
  const expired = await fetch(`${url}/v1/me`, {
    headers: { authorization: `Bearer ${pasteCredentials.accessToken}` },
  });
  expect(expired.status).toBe(401);
  expect((await expired.json()).error.code).toBe("ACCESS_TOKEN_EXPIRED");
  const narrow = await post("auth/sessions/revoke", {
    backendSessionId: pasteCredentials.backendSessionId,
    revokeSecret: pasteCredentials.revokeSecret,
  });
  expect(narrow.status).toBe(200);
  await narrow.body?.cancel();
  const malformed = await fetch(`${url}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: Buffer.concat([
      Buffer.from(`{"email":"${account.email}","password":"long-password`),
      Buffer.from([0xc3, 0x28]),
      Buffer.from('"}'),
    ]),
  });
  expect(malformed.status).toBe(400);
  expect((await malformed.json()).error.code).toBe("VALIDATION_FAILED");
  const quotaAccount = await f.account();
  for (let request = 0; request < 11; request += 1) {
    const limited = await post("auth/login", {
      ...quotaAccount,
      password: "incorrect-password",
    });
    if (request < 10) {
      expect(limited.status).toBe(401);
      await limited.body?.cancel();
      continue;
    }
    expect(limited.status).toBe(429);
    expect(login429Schema.parse(await limited.json()).error.code).toBe(
      "AUTH_RATE_LIMITED",
    );
    const retryAfter = Number(limited.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(900);
  }
  process.stdout.write(
    JSON.stringify({
      nativeAuth: "passed",
      scalarBoundaries: "passed",
      malformedUtf8: "passed",
    }),
  );
} finally {
  await app.close();
  await f.dispose();
}
