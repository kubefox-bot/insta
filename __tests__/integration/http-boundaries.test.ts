import { expect, test } from "bun:test";
import { correlationSchema } from "@insta/contracts/http";

test("actual built BFF rejects mixed-case valid oversized JSON and returns correlated readiness", async () => {
  for (const contentType of [
    "Application/JSON",
    "APPLICATION/json ; charset=utf-8",
  ]) {
    const body = JSON.stringify("x".repeat(65535));
    expect(new TextEncoder().encode(body).byteLength).toBe(65537);
    const response = await fetch("http://fe-insta:3000/api/health/ready", {
      method: "POST",
      headers: { "Content-Type": contentType, origin: "https://fe-insta:3000" },
      body,
    });
    expect(response.status).toBe(413);
  }
  const requestId = crypto.randomUUID();
  const response = await fetch("http://fe-insta:3000/api/health/ready", {
    headers: { "X-Request-ID": requestId },
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    ok: true,
    data: { status: "ok" },
    meta: correlationSchema.parse({ requestId }),
  });
});
