import { expect, test } from "bun:test";
import { createSupportHttpFixture as start } from "./fixture";

test("native support scoped form proof persists report before accepted pending response", async () => {
  const env = await start();
  try {
    const context = await fetch(`${env.url}/v1/support/form-context`);
    expect(context.status).toBe(200);
    expect(await context.json()).toMatchObject({
      ok: true,
      data: { proof: "support-proof", expiresAt: 86401000 },
    });
    const report = await fetch(`${env.url}/v1/support/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": "first",
      },
      body: JSON.stringify({
        comment: "😀",
        errorCode: "NETWORK_FAILED",
        guestContext: "support-proof",
      }),
    });
    expect(report.status).toBe(202);
    expect(await report.json()).toMatchObject({
      ok: true,
      data: { emailState: "pending" },
    });
    expect(env.stored).toHaveLength(1);
  } finally {
    await env.app.close();
  }
});
test("native support wrong proof and owner body cannot persist", async () => {
  const env = await start();
  try {
    for (const [body, status] of [
      [
        { comment: "test", errorCode: "NETWORK_FAILED", guestContext: "wrong" },
        403,
      ],
      [
        {
          comment: "test",
          errorCode: "NETWORK_FAILED",
          guestContext: "support-proof",
          userId: "attacker",
        },
        400,
      ],
    ] as const) {
      const response = await fetch(`${env.url}/v1/support/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(status);
    }
    expect(env.stored).toHaveLength(0);
  } finally {
    await env.app.close();
  }
});
