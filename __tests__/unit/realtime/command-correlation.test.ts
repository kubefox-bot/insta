import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { createCommandObserver } from "../../../apps/be-insta/src/lib/realtime/index";
import { createUnreadSummary } from "../../../apps/fe-insta/src/domains/conversations/browser/index";
import { createUnreadSubscription } from "../../../apps/fe-insta/src/domains/conversations/browser/realtime/index";
import { createConnection } from "../../../apps/fe-insta/src/lib/realtime/index";
import { createSubscriptionServer } from "../../fixtures/realtime/subscriptions";

test("actual Socket.IO callback accepts the backend observer's fresh requestId", async () => {
  const server = createServer();
  const io = new Server(server, { path: "/event" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing listener");
  const observe = createCommandObserver({ uuid: () => crypto.randomUUID() });
  const prepared = {
    subscriptionId: crypto.randomUUID(),
    baseline: {
      streamId: "unread:actor",
      epoch: crypto.randomUUID(),
      cursor: 0,
    },
  };
  io.on("connection", (socket) =>
    socket.on("command", async (_command, reply) => {
      reply(
        await observe({
          type: "conversations.unread.subscribe",
          classify: () => ({ code: "OK", outcome: "succeeded" }),
          execute: async (meta) => ({
            version: 1,
            kind: "ack",
            ok: true,
            meta,
            data: { ...prepared, subscription: "unread" },
          }),
        }),
      );
    }),
  );
  const ready = Promise.withResolvers<void>();
  const connection = createConnection({
    url: `http://127.0.0.1:${address.port}`,
    obtainTicket: async () => ({ kind: "issued", ticket: crypto.randomUUID() }),
    handlers: {
      "messages.created": () => "stale",
      "messages.receipts.updated": () => "stale",
      "conversations.unread.changed": () => "stale",
    },
    observe: (value) => {
      if (value.kind === "connected") ready.resolve();
    },
    onUnauthorized: () => {},
    onGenerationLost: () => {},
  });
  try {
    connection.connect();
    await ready.promise;
    const requestId = crypto.randomUUID();
    const ack = await connection.command({
      version: 1,
      kind: "command",
      type: "conversations.unread.subscribe",
      data: {},
      meta: { requestId },
    });
    expect(ack.ok).toBe(true);
    expect(ack.meta.requestId).not.toBe(requestId);
    expect(ack.ok && ack.data).toEqual({ ...prepared, subscription: "unread" });
  } finally {
    await connection.dispose();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  }
});

test("actual unread lifecycle bootstraps with server-owned command correlation", async () => {
  const server = createSubscriptionServer();
  const reads: string[] = [];
  const unread = createUnreadSummary({
    visible: () => true,
    load: async () => {
      reads.push("canonical");
      return { items: [] };
    },
  });
  unread.reconcileActor({ userId: "alice", generation: "login" });
  const subscription = createUnreadSubscription({
    unread,
    command: server.command,
    uuid: () => crypto.randomUUID(),
  });
  try {
    await subscription.connected();
    expect(reads).toEqual(["canonical"]);
    expect(server.commands.map((command) => command.type)).toEqual([
      "conversations.unread.subscribe",
      "conversations.activate",
    ]);
    expect(server.maxSlots()).toBe(1);
  } finally {
    subscription.dispose();
    unread.dispose();
  }
});
