import { expect, test } from "bun:test";
import { readCorrelation } from "@insta/contracts/http";
import { createAdmissionHttpFixture } from "../../../apps/be-insta/__tests__/unit/users/http-fixture";
import { createPasswordAdmission } from "../../../apps/be-insta/src/domains/users/adapters/passwords/admission";
import { authAdmissionReply } from "../../../apps/be-insta/src/domains/users/http/index";

test("full password admission produces actual Nest HTTP503 Retry-After before effect", async () => {
  const admission = createPasswordAdmission({
    concurrent: 1,
    queued: 0,
    queueTimeoutMs: 2000,
  });
  const release = await admission.acquire();
  let effects = 0;
  const server = await createAdmissionHttpFixture(async () => {
    const permit = await admission.acquire();
    try {
      effects += 1;
    } finally {
      permit();
    }
  });
  try {
    const response = await fetch(server.url);
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("2");
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "AUTH_BUSY" },
    });
    expect(effects).toBe(0);
  } finally {
    release();
    await server.close();
  }
});
test("limiter outage and quota denial have explicit safe transport contracts", () => {
  const meta = readCorrelation({});
  expect(
    authAdmissionReply({ failure: { state: "unavailable" }, meta }),
  ).toMatchObject({
    status: 503,
    headers: { "Retry-After": "2" },
    body: { error: { code: "AUTH_LIMITS_UNAVAILABLE" } },
  });
  expect(
    authAdmissionReply({
      failure: { state: "limited", retryAfterSeconds: 300 },
      meta,
    }),
  ).toMatchObject({
    status: 429,
    headers: { "Retry-After": "300" },
    body: { error: { code: "AUTH_RATE_LIMITED" } },
  });
});
