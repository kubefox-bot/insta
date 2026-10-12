import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { createApplicationRealtime } from "../../../apps/fe-insta/src/app/realtime/browser/create";
import { createAuthBrowser } from "../../../apps/fe-insta/src/domains/users/browser/store";

test("application composition binds delivery receiver to the real socket and waits for its apply", async () => {
  const server = createServer();
  const io = new Server(server, { path: "/event" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No listener");
  const originalFetch = globalThis.fetch;
  const originalNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );
  globalThis.fetch = Object.assign(
    async () =>
      Response.json({
        ok: true,
        data: { ticket: crypto.randomUUID(), expiresAt: Date.now() + 30000 },
      }),
    originalFetch,
  );
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true },
    configurable: true,
  });
  const auth = createAuthBrowser({
    initial: { actor: null, status: "guest" },
    read: async () => null,
    clearPrivate: () => {},
    synchronization: {
      exclusive: (execute) => execute(),
      publish: () => {},
      subscribe: () => () => {},
    },
  });
  const position = {
    subscriptionId: crypto.randomUUID(),
    streamId: "conversation:one",
    epoch: crypto.randomUUID(),
    cursor: 1,
  };
  const result = Promise.withResolvers<unknown>();
  const entered = Promise.withResolvers<void>();
  const apply = Promise.withResolvers<void>();
  let acknowledged = false;
  let calls = 0;
  const connection = createApplicationRealtime({
    url: `http://127.0.0.1:${address.port}`,
    auth,
    handlers: {
      "messages.created": () => "stale",
      "messages.receipts.updated": () => "stale",
      "conversations.unread.changed": () => "stale",
    },
    delivery: {
      notice: () => null,
      receive: async () => {
        calls++;
        entered.resolve();
        await apply.promise;
        return { reply: { kind: "applied", position } };
      },
    },
    observe: (kind) => {
      if (kind === "invalid")
        entered.reject(new Error("Application discarded delivery receiver"));
    },
    onGenerationLost: () => {},
  });
  io.on("connection", (socket) =>
    socket.emit(
      "event",
      {
        kind: "single",
        event: {
          version: 1,
          kind: "event",
          type: "conversations.unread.changed",
          eventId: crypto.randomUUID(),
          occurredAt: "2026-10-20T00:00:00.000Z",
          data: { conversationId: "one" },
          meta: { requestId: crypto.randomUUID() },
          delivery: position,
        },
      },
      (reply: unknown) => {
        acknowledged = true;
        result.resolve(reply);
      },
    ),
  );
  try {
    connection.connect();
    await entered.promise;
    expect(calls).toBe(1);
    expect(acknowledged).toBe(false);
    apply.resolve();
    expect(await result.promise).toEqual({ kind: "applied", position });
  } finally {
    apply.resolve();
    await connection.dispose();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    globalThis.fetch = originalFetch;
    if (originalNavigator)
      Object.defineProperty(globalThis, "navigator", originalNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});
