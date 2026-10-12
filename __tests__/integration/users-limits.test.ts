import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { createDragonflyAuthLimits } from "../../apps/be-insta/src/domains/users/adapters/dragonfly/limits";
import { authLimits } from "../../apps/be-insta/src/domains/users/domain/conts";
import {
  connectDragonfly,
  readGeneration,
} from "../../apps/be-insta/src/lib/dragonfly/index";
import { readTestApiConfig } from "../fixtures/environment";

test("N/N+1 quotas are shared across two Bun processes for every auth policy", async () => {
  const client = await connectDragonfly({
    config: readTestApiConfig().dragonfly,
  });
  const generation = await readGeneration(client);
  const keys: string[] = [];
  try {
    const limits = createDragonflyAuthLimits({ client, key: "a".repeat(64) });
    for (const limit of [
      "otpEmail",
      "otpIp",
      "loginEmail",
      "loginIp",
    ] as const) {
      const subject = `auth01-${crypto.randomUUID()}`;
      const digest = createHmac("sha256", Buffer.from("a".repeat(64), "hex"))
        .update(subject)
        .digest("hex");
      const key = `auth:${generation}:users:limit:${limit}:${digest}`;
      keys.push(key);
      const half = Math.floor(authLimits[limit].maximum / 2);
      const children = [half, authLimits[limit].maximum - half].map((count) =>
        Bun.spawn(
          [
            process.execPath,
            "__tests__/fixtures/users/limits-worker.ts",
            limit,
            subject,
            String(count),
          ],
          { stdout: "pipe", stderr: "pipe" },
        ),
      );
      const outputs = await Promise.all(
        children.map(async (child) => {
          const [output, error, code] = await Promise.all([
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
            child.exited,
          ]);
          if (code !== 0) throw new Error(`Limit worker failed: ${error}`);
          return JSON.parse(output) as unknown[];
        }),
      );
      expect(outputs.flat()).toHaveLength(authLimits[limit].maximum);
      expect(
        outputs
          .flat()
          .every(
            (outcome) =>
              typeof outcome === "object" &&
              outcome !== null &&
              "state" in outcome &&
              outcome.state === "allowed",
          ),
      ).toBe(true);
      const denied = await limits.consume({ limit, subject });
      expect(denied.isOk() && denied.get().state).toBe("limited");
      if (denied.isOk())
        expect(denied.get()).toMatchObject({
          retryAfterSeconds: expect.any(Number),
        });
      const ttl = Number(await client.send("PTTL", [key]));
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(authLimits[limit].windowMs);
      expect(await client.get(key)).toBe(String(authLimits[limit].maximum + 1));
    }
  } finally {
    try {
      for (const key of keys) {
        await client.del(key);
        expect(await client.get(key)).toBeNull();
      }
    } finally {
      client.close();
    }
  }
});
test("challenge five-error budget survives resend and limiter outage fails closed", async () => {
  const client = await connectDragonfly({
    config: readTestApiConfig().dragonfly,
  });
  const generation = await readGeneration(client);
  const challengeId = `auth01-${crypto.randomUUID()}`;
  const digest = createHmac("sha256", Buffer.from("a".repeat(64), "hex"))
    .update(challengeId)
    .digest("hex");
  const key = `auth:${generation}:users:challengeErrors:${digest}`;
  const limits = createDragonflyAuthLimits({ client, key: "a".repeat(64) });
  try {
    const now = Date.now();
    for (let index = 1; index <= 5; index += 1) {
      const result = await limits.recordChallengeError({
        challengeId,
        expiresAt: now + 60000,
        now,
      });
      expect(result.isOk() && result.get().state).toBe(
        index < 5 ? "allowed" : "limited",
      );
    }
    const ttl = Number(await client.send("PTTL", [key]));
    const resend = await limits.recordChallengeError({
      challengeId,
      expiresAt: now + 120000,
      now,
    });
    expect(resend.isOk() && resend.get().state).toBe("limited");
    expect(Number(await client.send("PTTL", [key]))).toBeLessThanOrEqual(ttl);
  } finally {
    await client.del(key);
    expect(await client.get(key)).toBeNull();
    client.close();
  }
  const unavailable = await limits.consume({
    limit: "otpEmail",
    subject: challengeId,
  });
  expect(unavailable.isError() && unavailable.getError()).toBe("unavailable");
});
