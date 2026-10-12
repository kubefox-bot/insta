import { expect, test } from "bun:test";
import { logFields } from "../../src/observability/contracts/conts";
import { createPinoAdapter } from "../../src/observability/server/index";

test("Pino whitelists every entry including native Nest and nested error text", async () => {
  const lines: string[] = [];
  const sink = createPinoAdapter({
    identity: {
      app: "insta",
      [logFields.serviceName]: "be-insta",
      source: "server",
    },
    destination: {
      write: (line) => {
        lines.push(line);
      },
    },
  });
  const canaries = [
    "CANARY_password",
    "$argon2id$CANARY_hash",
    "123456_CANARY_OTP",
    "CANARY_cookie",
    "canary@example.test",
    "CANARY_token",
    "CANARY_ticket",
    "CANARY_message_text",
    "https://private.test/v?signature=CANARY_signed_url",
  ];
  const secret = canaries.join(" ");
  sink.logger.error(
    {
      err: new Error(secret, { cause: new Error(secret) }),
      req: { headers: { cookie: secret }, body: secret },
      password: secret,
      nested: { token: secret },
      message: secret,
    },
    secret,
  );
  sink.emit({
    [logFields.schemaVersion]: 2,
    app: "insta",
    [logFields.serviceName]: "be-insta",
    source: "server",
    [logFields.eventType]: "exception",
    level: "error",
    exception: {
      message: secret,
      stacktrace: secret,
      cause: { message: secret },
    },
  });
  await sink.close();
  const output = lines.join("");
  for (const canary of canaries) expect(output).not.toContain(canary);
  expect(lines).toHaveLength(2);
  for (const line of lines) {
    expect([...line.matchAll(/"level":/g)]).toHaveLength(1);
    expect(JSON.parse(line)).toMatchObject({
      [logFields.schemaVersion]: 2,
      level: "error",
      [logFields.serviceName]: "be-insta",
      source: "server",
    });
  }
});

test("flush is bounded and idempotent without owning a borrowed destination", async () => {
  let flushCalls = 0;
  const destination = {
    write: (_line: string) => {},
    flush: (_done: (error?: Error) => void) => {
      flushCalls++;
    },
  };
  const sink = createPinoAdapter({
    identity: {
      app: "insta",
      [logFields.serviceName]: "be-insta",
      source: "server",
    },
    destination,
    flushTimeoutMs: 10,
  });
  expect(await sink.close()).toBe("timeout");
  expect(await sink.close()).toBe("timeout");
  expect(flushCalls).toBe(1);
});
