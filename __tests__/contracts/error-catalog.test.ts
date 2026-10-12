import { expect, test } from "bun:test";
import { createServer } from "node:http";
import * as errorContracts from "@insta/contracts/errors";
import { Server } from "socket.io";
import { get } from "svelte/store";
import { messages } from "../../apps/fe-insta/src/lib/i18n/index";
import * as realtime from "../../apps/fe-insta/src/lib/realtime/index";

test("catalogue preserves owner enums and existing serialized error codes", () => {
  const codes = errorContracts.codes;
  expect<string>(codes?.common.DependencyUnavailable).toBe(
    "DEPENDENCY_UNAVAILABLE",
  );
  expect<string>(codes?.auth.SessionRevoked).toBe("SESSION_REVOKED");
  expect<string>(codes?.session.ActorChanged).toBe("ACTOR_CHANGED");
  expect<string>(codes?.conversations.ConversationForbidden).toBe(
    "CONVERSATION_FORBIDDEN",
  );
  expect<string>(codes?.messages.IdempotencyConflict).toBe(
    "IDEMPOTENCY_CONFLICT",
  );
  expect<string>(codes?.receipts.ReceiptOutcomeUnknown).toBe(
    "RECEIPT_OUTCOME_UNKNOWN",
  );
  expect(codes?.common).toBe(errorContracts.CommonErrorCode);
  expect(codes?.auth).toBe(errorContracts.AuthErrorCode);
  expect(codes?.session).toBe(errorContracts.SessionErrorCode);
  expect(codes?.conversations).toBe(errorContracts.ConversationErrorCode);
  expect(codes?.messages).toBe(errorContracts.MessageErrorCode);
  expect(codes?.receipts).toBe(errorContracts.ReceiptErrorCode);
  expect(codes?.realtime).toBe(errorContracts.RealtimeErrorCode);
  expect(codes?.stories).toBe(errorContracts.StoryErrorCode);
  expect(codes?.directory).toBe(errorContracts.DirectoryErrorCode);
  expect(codes?.registration).toBe(errorContracts.RegistrationErrorCode);
  expect(codes?.continuation).toBe(errorContracts.ContinuationErrorCode);
  expect(codes?.privacy).toBe(errorContracts.PrivacyErrorCode);
  expect(codes?.support).toBe(errorContracts.SupportErrorCode);
});

test("catalogue publishes explicit recovery codes without changing existing realtime strings", () => {
  expect<string>(errorContracts.codes?.realtime.ResyncRequired).toBe(
    "RESYNC_REQUIRED",
  );
  expect<string>(errorContracts.codes?.realtime.ProtocolUnsupported).toBe(
    "PROTOCOL_UNSUPPORTED",
  );
  expect<string>(errorContracts.codes?.realtime.DeliveryBlocked).toBe(
    "DELIVERY_BLOCKED",
  );
  expect<string>(errorContracts.codes?.realtime.UnsupportedCommand).toBe(
    "UNSUPPORTED_COMMAND",
  );
  expect<string>(errorContracts.codes?.realtime.RateLimited).toBe(
    "RATE_LIMITED",
  );
  expect<string>(errorContracts.codes?.realtime.ServiceUnavailable).toBe(
    "SERVICE_UNAVAILABLE",
  );
});

test("errors public entrypoint can be bundled for the browser without server imports", async () => {
  const build = await Bun.build({
    entrypoints: [
      new URL("../../packages/contracts/src/errors/index.ts", import.meta.url)
        .pathname,
    ],
    target: "browser",
  });
  expect(build.success, build.logs.join("\n")).toBe(true);
  const output = await build.outputs[0]?.text();
  expect(output).toContain("DELIVERY_BLOCKED");
  expect(output).not.toContain("$app/server");
  expect(output).not.toContain("WS_OUTBOX_UNAVAILABLE");
  expect(output).not.toContain("API_BASE_URL");
});

test.each([
  ["RESYNC_REQUIRED", "resyncRequired"],
  ["PROTOCOL_UNSUPPORTED", "protocolUnsupported"],
  ["DELIVERY_BLOCKED", "deliveryBlocked"],
  ["SERVICE_UNAVAILABLE", "unavailable"],
  ["RATE_LIMITED", "rateLimited"],
  ["UNSUPPORTED_COMMAND", "unexpected"],
] as const)(
  "public code %s selects localized copy in both locales",
  (code, key) => {
    for (const copy of [messages.en, messages.ru]) {
      const actual = realtime.realtimeErrorCopy?.({ code, copy });
      expect(actual).toBeDefined();
      expect(actual).toBe(copy.errors[key]);
    }
  },
);

test.each(["FUTURE_CODE", "__proto__", "constructor", "WS_OUTBOX_UNAVAILABLE"])(
  "unknown external code %s retains the safe locale fallback",
  (code) => {
    for (const copy of [messages.en, messages.ru])
      expect(realtime.realtimeErrorCopy?.({ code, copy })).toBe(
        copy.errors.unexpected,
      );
  },
);

test("error locale keys and interpolation placeholders agree", () => {
  expect(Object.keys(messages.ru.errors).sort()).toEqual(
    Object.keys(messages.en.errors).sort(),
  );
  for (const [key, english] of Object.entries(messages.en.errors)) {
    const russian = Object.entries(messages.ru.errors).find(
      ([name]) => name === key,
    )?.[1];
    expect(russian).toBeDefined();
    expect(russian?.match(/\{\w+\}/g) ?? []).toEqual(
      english.match(/\{\w+\}/g) ?? [],
    );
  }
});

test.each([
  ["SESSION_REVOKED", "unauthorized", 1],
  ["SERVICE_UNAVAILABLE", "connected", 0],
] as const)(
  "real command ACK %s preserves its outcome and delegates revocation only",
  async (code, state, unauthorizedCalls) => {
    const server = createServer();
    const io = new Server(server, { path: "/event" });
    const ack = {
      version: 1,
      kind: "ack",
      ok: false,
      error: { code, message: "Failure" },
      meta: { requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    };
    io.on("connection", (socket) => {
      socket.on("command", (_command, reply) => reply(ack));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing listener");
    const connected = Promise.withResolvers<void>();
    const observations: string[] = [];
    const revocations: true[] = [];
    const tickets: true[] = [];
    const connection = realtime.createConnection({
      url: `http://127.0.0.1:${address.port}`,
      obtainTicket: async () => {
        tickets.push(true);
        return { kind: "issued", ticket: "ticket" };
      },
      handlers: {
        "messages.created": () => "stale" as const,
        "conversations.unread.changed": () => "stale" as const,
        "messages.receipts.updated": () => "stale" as const,
      },
      observe: (value) => {
        observations.push(value.kind);
        if (value.kind === "connected") connected.resolve();
      },
      onUnauthorized: () => {
        revocations.push(true);
      },
      onGenerationLost: () => {},
    });
    try {
      connection.connect();
      await connected.promise;
      const result = await connection.command({
        version: 1,
        kind: "command",
        type: "conversations.unread.subscribe",
        data: {},
        meta: ack.meta,
      });
      expect<unknown>(result).toEqual(ack);
      expect(get(connection.viewState).kind).toBe(state);
      expect(revocations).toHaveLength(unauthorizedCalls);
      expect(tickets).toHaveLength(1);
      expect(observations).not.toContain("retry");
      if (state === "unauthorized")
        await expect(
          connection.command({
            version: 1,
            kind: "command",
            type: "conversations.unread.subscribe",
            data: {},
            meta: ack.meta,
          }),
        ).rejects.toThrow("Realtime disconnected");
    } finally {
      await connection.dispose();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    }
  },
);
