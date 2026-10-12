import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { connect as connectTcp } from "node:net";
import { Writable } from "node:stream";
import { Result } from "@bloodyowl/boxed";
import { logFields } from "@insta/fe-core/observability/contracts";
import {
  createPinoAdapter,
  createTracing,
} from "@insta/fe-core/observability/server";
import { io } from "socket.io-client";
import { createCommandObserver } from "../../../src/lib/realtime/index";
import { deliveryProviders } from "../../fixtures/realtime/providers";

test("gateway gets a fresh context per command and rejects unknown commands", async () => {
  const path = "../../../src/domains/conversations/adapters/ws/gateway.ts";
  expect(await Bun.file(new URL(path, import.meta.url)).exists()).toBe(true);
  const { createConversationGateway } = await import(path);
  const server = createServer();
  const actor = {
    userId: "alice",
    backendSessionId: "session",
    username: "Alice",
    accessExpiresAt: Date.now() + 60000,
  };
  const logs: string[] = [];
  const adapter = createPinoAdapter({
    identity: {
      app: "insta",
      [logFields.serviceName]: "be-insta",
      source: "server",
    },
    destination: new Writable({
      write(chunk, _encoding, callback) {
        logs.push(chunk.toString());
        callback();
      },
    }),
  });
  const tracing = createTracing();
  let permits = true;
  let budget: "allowed" | "limited" | "unavailable" = "allowed";
  const gateway = createConversationGateway({
    server,
    origin: "https://localhost",
    tickets: { consume: async () => actor },
    authorize: async () => Result.Ok(actor),
    membership: { permits: async () => permits },
    ...deliveryProviders(),
    quota: {
      consume: async () =>
        budget === "unavailable"
          ? Result.Error("unavailable")
          : Result.Ok(budget),
    },
    observe: createCommandObserver({
      uuid: () => crypto.randomUUID(),
      clock: () => 20,
      observability: { adapter, tracing, close: async () => {} },
    }),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No test listener");
  const client = io(`http://127.0.0.1:${address.port}`, {
    path: "/event",
    transports: ["websocket"],
    auth: { ticket: crypto.randomUUID() },
    extraHeaders: { origin: "https://localhost" },
    reconnection: false,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      client.once("connect", resolve);
      client.once("connect_error", reject);
    });
    const command = {
      version: 1,
      kind: "command",
      type: "conversations.subscribe",
      data: { conversationId: "012345678901234567890123" },
      meta: { requestId: crypto.randomUUID() },
    };
    const first = await client.timeout(2000).emitWithAck("command", command);
    const second = await client.timeout(2000).emitWithAck("command", command);
    expect(first.ok).toBe(true);
    expect(second.meta.requestId).not.toBe(first.meta.requestId);
    const unknown = await client
      .timeout(2000)
      .emitWithAck("command", { ...command, type: "CANARY_PRIVATE_COMMAND" });
    expect(unknown.error.code).toBe("UNSUPPORTED_COMMAND");
    const version = await client
      .timeout(2000)
      .emitWithAck("command", { ...command, version: 9 });
    expect(version.error.code).toBe("PROTOCOL_UNSUPPORTED");
    permits = false;
    expect(
      (await client.timeout(2000).emitWithAck("command", command)).error.code,
    ).toBe("FORBIDDEN");
    budget = "limited";
    expect(
      (await client.timeout(2000).emitWithAck("command", command)).error.code,
    ).toBe("RATE_LIMITED");
    budget = "unavailable";
    expect(
      (await client.timeout(2000).emitWithAck("command", command)).error.code,
    ).toBe("SERVICE_UNAVAILABLE");
    const terminal = logs.map((line) => JSON.parse(line).business);
    expect(terminal).toEqual([
      {
        operation: "conversations.subscribe",
        outcome: "succeeded",
        code: "OK",
        authority: "server_canonical",
        [logFields.durationMs]: 0,
      },
      {
        operation: "conversations.subscribe",
        outcome: "succeeded",
        code: "OK",
        authority: "server_canonical",
        [logFields.durationMs]: 0,
      },
      {
        operation: "ws.unsupported",
        outcome: "rejected",
        code: "UNSUPPORTED_COMMAND",
        authority: "server_canonical",
        [logFields.durationMs]: 0,
      },
      {
        operation: "ws.unsupported",
        outcome: "rejected",
        code: "PROTOCOL_UNSUPPORTED",
        authority: "server_canonical",
        [logFields.durationMs]: 0,
      },
      {
        operation: "conversations.subscribe",
        outcome: "rejected",
        code: "FORBIDDEN",
        authority: "server_canonical",
        [logFields.durationMs]: 0,
      },
      {
        operation: "conversations.subscribe",
        outcome: "rejected",
        code: "RATE_LIMITED",
        authority: "server_canonical",
        [logFields.durationMs]: 0,
      },
      {
        operation: "conversations.subscribe",
        outcome: "failed",
        code: "SERVICE_UNAVAILABLE",
        authority: "server_canonical",
        [logFields.durationMs]: 0,
      },
    ]);
    expect(logs.join("")).not.toContain(command.data.conversationId);
    expect(logs.join("")).not.toContain("CANARY");
  } finally {
    client.disconnect();
    await gateway.close();
    await tracing.close();
    await adapter.close();
  }
});

test("ticket storage outage is a temporary 503 and preserves auth", async () => {
  const { createConversationGateway } = await import(
    "../../../src/domains/conversations/adapters/ws/gateway"
  );
  const server = createServer();
  const gateway = createConversationGateway({
    server,
    origin: "https://localhost",
    tickets: {
      consume: async () => {
        throw new Error("Isolated storage outage");
      },
    },
    authorize: async () => Result.Error("unused"),
    membership: { permits: async () => false },
    ...deliveryProviders(),
    quota: { consume: async () => Result.Ok("allowed") },
    observe: async ({ execute }) => execute({ requestId: crypto.randomUUID() }),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No listener");
  const socket = io(`http://127.0.0.1:${address.port}`, {
    path: "/event",
    transports: ["websocket"],
    auth: { ticket: crypto.randomUUID() },
    extraHeaders: { origin: "https://localhost" },
    reconnection: false,
  });
  try {
    const error = await new Promise<{ data?: { status: number } }>((resolve) =>
      socket.once("connect_error", resolve),
    );
    expect(error.data?.status).toBe(503);
  } finally {
    socket.disconnect();
    await gateway.close();
  }
});

test("websocket-only requires explicit configured Origin and rejects retired polling transport", async () => {
  const { createConversationGateway } = await import(
    "../../../src/domains/conversations/adapters/ws/gateway"
  );
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No listener");
  const origin = `http://127.0.0.1:${address.port}`;
  const actor = {
    userId:
      "012345678901234567890123" as import("../../../src/domains/users/index").UserId,
    backendSessionId:
      crypto.randomUUID() as import("../../../src/domains/users/index").SessionId,
    username: "Synthetic",
    accessExpiresAt: Date.now() + 60000,
  };
  const gateway = createConversationGateway({
    server,
    origin,
    tickets: { consume: async () => actor },
    authorize: async () => Result.Ok(actor),
    membership: { permits: async () => true },
    ...deliveryProviders(),
    quota: { consume: async () => Result.Ok("allowed") },
    observe: async ({ execute }) => execute({ requestId: crypto.randomUUID() }),
  });
  const clients: ReturnType<typeof io>[] = [];
  const connectWith = (extraHeaders: Readonly<Record<string, string>>) => {
    const socket = io(origin, {
      path: "/event",
      transports: ["websocket"],
      auth: { ticket: crypto.randomUUID() },
      reconnection: false,
      extraHeaders: { ...extraHeaders },
    });
    clients.push(socket);
    return new Promise<boolean>((resolve) => {
      socket.once("connect", () => resolve(true));
      socket.once("connect_error", () => resolve(false));
    });
  };
  try {
    expect(await connectWith({ origin })).toBe(true);
    expect(await connectWith({ "sec-fetch-site": "same-origin" })).toBe(false);
    expect(
      await connectWith({
        origin: "https://foreign.test",
        "sec-fetch-site": "same-origin",
      }),
    ).toBe(false);
    const rawPolling = (hostLines: string) =>
      new Promise<string>((resolve, reject) => {
        const client = connectTcp({ host: "127.0.0.1", port: address.port });
        const chunks: Buffer[] = [];
        client.setTimeout(2000, () =>
          client.destroy(new Error("Owned polling probe deadline")),
        );
        client.once("connect", () =>
          client.write(
            `GET /event/?EIO=4&transport=polling HTTP/1.1\r\n${hostLines}\r\nSec-Fetch-Site: same-origin\r\nConnection: close\r\n\r\n`,
          ),
        );
        client.on("data", (chunk) =>
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk),
        );
        client.once("end", () =>
          resolve(Buffer.concat(chunks).toString().split("\r\n")[0] ?? ""),
        );
        client.once("error", reject);
      });
    expect(await rawPolling("Host: foreign.test")).toMatch(/^HTTP\/1\.1 400\b/);
    expect(
      await rawPolling(`Host: 127.0.0.1:${address.port}\r\nHost: foreign.test`),
    ).toMatch(/^HTTP\/1\.1 400\b/);
    expect(
      await connectWith({ origin: "null", "sec-fetch-site": "same-origin" }),
    ).toBe(false);
    expect(await connectWith({ "sec-fetch-site": "same-site" })).toBe(false);
    expect(await connectWith({})).toBe(false);
  } finally {
    for (const client of clients) client.disconnect();
    await gateway.close();
  }
});
