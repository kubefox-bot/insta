import { expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { checkContracts } from "../../tooling/contracts/check";
import { readProbeReport } from "../fixtures/probe-report";

test("backend exports concrete3.1 status schemas; regeneration detects drift without touching checkout", async () => {
  const root = resolve(import.meta.dir, "../..");
  const document = JSON.parse(
    await readFile(join(root, "packages/contracts/openapi.json"), "utf8"),
  );
  expect(document.openapi).toBe("3.1.0");
  expect(
    document.paths["/v1/stories/{id}/playback"].get.responses["404"],
  ).toBeDefined();
  expect(Object.keys(document.paths)).toEqual([
    "/health/live",
    "/health/ready",
    "/v1/privacy/preferences",
    "/v1/auth/login",
    "/v1/auth/refresh",
    "/v1/auth/sessions/revoke",
    "/v1/me",
    "/v1/auth/ws-ticket",
    "/v1/auth/registration/start",
    "/v1/auth/registration/verify",
    "/v1/auth/registration/complete",
    "/v1/support/form-context",
    "/v1/support/reports",
    "/v1/users",
    "/v1/conversations",
    "/v1/conversations/unread",
    "/v1/conversations/{id}/messages",
    "/v1/conversations/{id}/receipts",
    "/v1/stories/policy",
    "/v1/stories",
    "/v1/stories/publications/{operationId}",
    "/v1/stories/{id}/playback",
  ]);
  const policy = document.paths["/v1/stories/policy"].get;
  expect(policy.operationId).toBe("readStoryPolicy");
  expect(Object.keys(policy.responses)).toEqual(["200", "404"]);
  expect(
    Object.keys(
      policy.responses["200"].content["application/json"].schema.properties.data
        .properties,
    ),
  ).toEqual([
    "maxDurationMs",
    "lifetimeMs",
    "maxFileBytes",
    "captureSafetyMarginMs",
  ]);
  expect(Object.keys(document.paths["/health/ready"].get.responses)).toEqual([
    "200",
    "500",
    "503",
  ]);
  expect(
    document.paths["/health/ready"].get.responses["500"].content[
      "application/json"
    ].schema.properties.error.properties.code.enum,
  ).toEqual(["INTERNAL_ERROR"]);
  expect(
    document.paths["/health/ready"].get.parameters ?? [],
  ).not.toContainEqual(expect.objectContaining({ name: "X-Idempotency-Key" }));
  await checkContracts(root);
  const temp = await mkdtemp(join(tmpdir(), "insta-drift-"));
  try {
    await cp(
      join(root, "apps/fe-insta/src/lib/api/generated"),
      join(temp, "apps/fe-insta/src/lib/api/generated"),
      { recursive: true },
    );
    await cp(
      join(root, "packages/contracts"),
      join(temp, "packages/contracts"),
      { recursive: true },
    );
    await writeFile(join(temp, "packages/contracts/openapi.json"), "{}");
    await expect(checkContracts(temp)).rejects.toThrow(
      "Generated contracts differ",
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}, 30000);
test("generated operation uses real Nest transport and no network/header correlation invention", async () => {
  const probe = Bun.spawn([process.execPath, "__tests__/contracts/probe.ts"], {
    cwd: resolve(import.meta.dir, "../../apps/be-insta"),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, exit] = await Promise.all([
    new Response(probe.stdout).text(),
    new Response(probe.stderr).text(),
    probe.exited,
  ]);
  expect(exit, err + out).toBe(0);
  expect(readProbeReport(out)).toEqual({
    health: true,
    correlation: true,
    noRetries: true,
    boundedBody: true,
    timeout: true,
  });
}, 30000);
test("generated schemas preserve UUIDv4, nonzero trace and closed envelope contracts", async () => {
  const { getHealthReady200Schema } = await import(
    "../../apps/fe-insta/src/lib/api/generated/schemas/getHealthReadySchema"
  );
  const meta = { requestId: "ab6c77d6-fbd6-4d22-9780-84a6e284cde9" };
  const payload = {
    ok: true,
    data: { status: "ok", mail: "ok", delivery: "ok" },
    meta,
  };
  expect(getHealthReady200Schema.safeParse(payload).success).toBe(true);
  expect(
    getHealthReady200Schema.safeParse({
      ...payload,
      error: { code: "INTERNAL_ERROR", message: "wrong branch" },
    }).success,
  ).toBe(false);
  expect(
    getHealthReady200Schema.safeParse({
      ...payload,
      meta: { ...meta, operationId: "8d96fdc6-021a-1b44-bb44-123b4df7f53a" },
    }).success,
  ).toBe(false);
  expect(
    getHealthReady200Schema.safeParse({
      ...payload,
      meta: { ...meta, traceId: "0".repeat(32) },
    }).success,
  ).toBe(false);
});
test("isolated Nest boundary returns safe validation400 and unexpected500 envelopes", async () => {
  const probe = Bun.spawn(
    [process.execPath, "__tests__/contracts/errors-probe.ts"],
    {
      cwd: resolve(import.meta.dir, "../../apps/be-insta"),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [out, err, exit] = await Promise.all([
    new Response(probe.stdout).text(),
    new Response(probe.stderr).text(),
    probe.exited,
  ]);
  expect(exit, err + out).toBe(0);
  const observed = JSON.parse(out);
  expect(observed.invalidStatus).toBe(400);
  expect(observed.invalid).toEqual({
    ok: false,
    error: {
      code: "VALIDATION_FAILED",
      message: "Request validation failed",
      details: {
        issues: [
          { path: ["count"], code: "INVALID_VALUE", message: "Invalid value" },
        ],
      },
    },
    meta: { requestId: "ab6c77d6-fbd6-4d22-9780-84a6e284cde9" },
  });
  expect(observed.faultStatus).toBe(500);
  expect(observed.fault).toEqual({
    ok: false,
    error: { code: "INTERNAL_ERROR", message: "Request failed" },
    meta: { requestId: "ab6c77d6-fbd6-4d22-9780-84a6e284cde9" },
  });
  expect(out).not.toContain("SYNTHETIC_");
});
test("generation fails closed for a future open object DTO rather than rewriting its source contract", async () => {
  const { assertClosedWireObjects } = await import(
    "../../tooling/contracts/schema-policy"
  );
  expect(() =>
    assertClosedWireObjects({
      paths: {
        "/fixture": {
          get: {
            responses: {
              200: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {},
                      additionalProperties: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
  ).toThrow("Unsupported open wire object");
  expect(() =>
    assertClosedWireObjects({
      components: {
        schemas: {
          nested: {
            type: "object",
            additionalProperties: false,
            properties: {
              map: { type: "object", additionalProperties: { type: "string" } },
            },
          },
        },
      },
    }),
  ).toThrow("Unsupported open wire object");
  expect(() =>
    assertClosedWireObjects({
      components: {
        schemas: {
          closed: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
        },
      },
    }),
  ).not.toThrow();
});
