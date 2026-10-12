import { expect, test } from "bun:test";
import {
  readSupportScope,
  sealSupportScope,
} from "../../../apps/fe-insta/src/domains/support-reports/server/cookie";
import { submitSupportRequest } from "../../../apps/fe-insta/src/domains/support-reports/server/submit";
import type { SupportServerDependencies } from "../../../apps/fe-insta/src/domains/support-reports/server/types";

const key = new Uint8Array(32).fill(4);
test("protected web support scope round trip retains original guest proof and owner, expiry and tampering reject", async () => {
  const scope = {
    scopeId: crypto.randomUUID(),
    proof: "private-guest-proof",
    userId: null,
    expiresAt: 20000,
  };
  const cookie = await sealSupportScope({ scope, key });
  expect(cookie).not.toContain(scope.proof);
  expect(await readSupportScope({ cookie, key, now: 1000 })).toEqual(scope);
  expect(await readSupportScope({ cookie, key, now: 20000 })).toBeNull();
  expect(
    await readSupportScope({ cookie: `${cookie}tampered`, key, now: 1000 }),
  ).toBeNull();
});
test("unknown support submission preserves proof/key; identity unavailable or changed cannot become guest", async () => {
  const scope = {
    scopeId: crypto.randomUUID(),
    proof: "private-guest-proof",
    userId: null,
    expiresAt: 20000,
  };
  const cookie = await sealSupportScope({ scope, key });
  const submitted: unknown[] = [];
  const dependencies: SupportServerDependencies = {
    key,
    context: { requestId: crypto.randomUUID() },
    clock: () => 1000,
    uuid: () => crypto.randomUUID(),
    identity: async () => ({ userId: null, unavailable: false }),
    authorized: async () => new Response(null, { status: 503 }),
    backend: {
      context: async () => new Response(null, { status: 503 }),
      submit: async (value) => {
        submitted.push(value);
        throw new Error("unknown response");
      },
    },
  };
  const body = {
    scopeId: scope.scopeId,
    idempotencyKey: crypto.randomUUID(),
    comment: "draft",
    errorCode: "TECHNICAL_PROBLEM",
  };
  const input = () => ({
    request: new Request("https://localhost/api/support", {
      method: "POST",
      headers: {
        origin: "https://localhost",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    origin: "https://localhost",
    cookies: {
      get: () => cookie,
      set: () => {},
      delete: () => {},
      getAll: () => [],
      serialize: () => "",
      parse: () => ({ name: "insta_support", value: cookie }),
    },
  });
  for (let attempt = 0; attempt < 2; attempt++)
    expect((await submitSupportRequest(input(), dependencies)).status).toBe(
      503,
    );
  expect(submitted).toHaveLength(2);
  expect(submitted[1]).toEqual(submitted[0]);
  expect(
    (
      await submitSupportRequest(input(), {
        ...dependencies,
        identity: async () => ({ userId: null, unavailable: true }),
      })
    ).status,
  ).toBe(503);
  expect(submitted).toHaveLength(2);
  expect(
    (
      await submitSupportRequest(input(), {
        ...dependencies,
        identity: async () => ({ userId: "different", unavailable: false }),
      })
    ).status,
  ).toBe(409);
  expect(submitted).toHaveLength(2);
});
