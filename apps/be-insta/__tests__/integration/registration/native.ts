import { expect } from "bun:test";
import { z } from "zod";
import { createRegistrationEnvironment } from "../../../../../__tests__/fixtures/registration/environment";
import {
  completeRegistration200Schema,
  completeRegistration400Schema,
} from "../../../../../apps/fe-insta/src/lib/api/generated/schemas/completeRegistrationSchema";
import {
  startRegistration200Schema,
  startRegistration400Schema,
} from "../../../../../apps/fe-insta/src/lib/api/generated/schemas/startRegistrationSchema";
import { verifyRegistration200Schema } from "../../../../../apps/fe-insta/src/lib/api/generated/schemas/verifyRegistrationSchema";
import { createApplication } from "../../../src/app/bootstrap";
import { registrationStartSuccessSchema } from "../../../src/domains/users/auth/adapters/http/registration.dto";
import { loginSuccessSchema } from "../../../src/domains/users/auth/adapters/http/session.dto";
import { deliverCode } from "../../../src/domains/users/auth/use-cases/deliver-code";

const f = await createRegistrationEnvironment();
const app = await createApplication(
  {
    users: { ...f.users, registration: f.dependencies },
    checkRequired: async () => true,
    check: async () => ({ ready: true, mail: "ok", delivery: "ok" }),
    close: async () => {},
  },
  { mode: "offline" },
);
try {
  await app.listen(0, "127.0.0.1");
  const url = await app.getUrl();
  const post = (path: string, body: unknown, key?: string) =>
    fetch(`${url}/v1/auth/registration/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { "X-Idempotency-Key": key } : {}),
      },
      body: JSON.stringify(body),
    });
  const email = f.email("native");
  f.ownEmail(email);
  const unsupportedOperationId = "00000000-0000-1000-8000-000000000001";
  const invalidStart = await post("start", {
    email,
    operationId: unsupportedOperationId,
  });
  expect(invalidStart.status).toBe(400);
  expect(
    startRegistration400Schema.parse(await invalidStart.json()).error.code,
  ).toBe("VALIDATION_FAILED");
  expect(
    await f.dependencies.challenges.read(
      f.dependencies.crypto.challengeId(email),
    ),
  ).toBeNull();
  expect(await f.jobs.next()).toBeNull();
  expect(
    await f.db.collection("users").countDocuments({ emailKey: email }),
  ).toBe(0);
  const startOperationId = f.operation();
  const start = await post("start", { email, operationId: startOperationId });
  expect(start.status).toBe(200);
  expect(start.headers.get("cache-control")).toBe("no-store");
  const requested = startRegistration200Schema.parse(await start.json());
  expect(registrationStartSuccessSchema.safeParse(requested).success).toBe(
    true,
  );
  expect(requested.meta.operationId).toBe(startOperationId);
  expect(
    await deliverCode({
      jobs: f.jobs,
      crypto: f.dependencies.crypto,
      sender: f.sender,
      clock: f.clock,
    }),
  ).toBe("accepted");
  const mails = await f.mail(email);
  expect(mails).toHaveLength(1);
  const code = z
    .string()
    .parse(mails[0]?.Text.match(/Код подтверждения: ([0-9]{6})/)?.[1]);
  const verification = await post("verify", {
    challengeId: requested.data.challengeId,
    code,
  });
  expect(verification.status).toBe(200);
  const verified = verifyRegistration200Schema.parse(await verification.json());
  if (verified.data.status !== "pending_setup")
    throw new Error("Expected setup proof");
  const forbidden = await fetch(`${url}/v1/me`, {
    headers: { authorization: `Bearer ${verified.data.registrationProof}` },
  });
  expect(forbidden.status).toBe(401);
  await forbidden.body?.cancel();
  const input = {
    proof: verified.data.registrationProof,
    username: `U${crypto.randomUUID().replaceAll("-", "").slice(0, 25)}`,
    password: "😀".repeat(128),
    operationId: f.operation(),
  };
  for (const password of [
    "😀".repeat(129),
    `${"x".repeat(128)}\n`,
    `${"x".repeat(12)}\ud800`,
  ]) {
    const invalid = await post("complete", { ...input, password });
    expect(invalid.status).toBe(400);
    expect(
      completeRegistration400Schema.parse(await invalid.json()).error.code,
    ).toBe("VALIDATION_FAILED");
  }
  const invalidComplete = await post("complete", {
    ...input,
    operationId: unsupportedOperationId,
  });
  expect(invalidComplete.status).toBe(400);
  expect(
    completeRegistration400Schema.parse(await invalidComplete.json()).error
      .code,
  ).toBe("VALIDATION_FAILED");
  const pending = await f.db.collection("users").findOne({ emailKey: email });
  expect(pending?.status).toBe("pending_setup");
  expect(
    await f.db
      .collection("users_sessions")
      .countDocuments({ userId: pending?._id }),
  ).toBe(0);
  expect(
    await f.db
      .collection("users_outbox")
      .countDocuments({ operationId: unsupportedOperationId }),
  ).toBe(0);
  const key = crypto.randomUUID();
  const complete = await post("complete", input, key);
  expect(complete.status).toBe(200);
  const committed = completeRegistration200Schema.parse(await complete.json());
  expect(loginSuccessSchema.safeParse(committed).success).toBe(true);
  expect(committed.meta.operationId).toBe(input.operationId);
  const repeat = await post(
    "complete",
    { ...input, operationId: f.operation() },
    key,
  );
  expect(repeat.status).toBe(200);
  const replay = completeRegistration200Schema.parse(await repeat.json());
  expect(replay.data).toEqual(committed.data);
  expect(replay.meta.operationId).toBe(committed.meta.operationId);
  expect(replay.meta.requestId).not.toBe(committed.meta.requestId);
  const me = await fetch(`${url}/v1/me`, {
    headers: { authorization: `Bearer ${committed.data.accessToken}` },
  });
  expect(me.status).toBe(200);
  await me.body?.cancel();
  process.stdout.write(
    JSON.stringify({
      nativeRegistration: "passed",
      operationIdBoundary: "passed",
      mailpitObserver: "passed",
      scalarBoundaries: "passed",
      canonicalReplay: "passed",
    }),
  );
} finally {
  await app.close();
  await f.dispose();
}
