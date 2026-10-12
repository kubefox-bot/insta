import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { RealtimeErrorCode } from "@insta/contracts/realtime";
import { Server } from "socket.io";
import { get } from "svelte/store";
import { createConnection } from "../../../apps/fe-insta/src/lib/realtime/connection";
import type {
  DeliveryReceiver,
  EventHandlers,
} from "../../../apps/fe-insta/src/lib/realtime/index";

const handlers: EventHandlers = {
  "messages.created": () => "stale",
  "messages.receipts.updated": () => "stale",
  "conversations.unread.changed": () => "stale",
};
const identity = {
  subscriptionId: crypto.randomUUID(),
  streamId: "conversation:one",
  epoch: crypto.randomUUID(),
};
const notice = {
  version: 1,
  kind: "delivery-notice",
  ...identity,
  code: RealtimeErrorCode.ResyncRequired,
} as const;
const unit = {
  kind: "single",
  event: {
    version: 1,
    kind: "event",
    type: "conversations.unread.changed",
    eventId: crypto.randomUUID(),
    occurredAt: "2026-10-20T00:00:00.000Z",
    data: { conversationId: "one" },
    meta: { requestId: crypto.randomUUID() },
    delivery: { ...identity, cursor: 1 },
  },
};
const start = async (receiver: DeliveryReceiver) => {
  const server = createServer();
  const io = new Server(server, { path: "/event" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No listener");
  const ready = Promise.withResolvers<void>();
  const connection = createConnection({
    url: `http://127.0.0.1:${address.port}`,
    handlers,
    delivery: receiver,
    obtainTicket: async () => ({ kind: "issued", ticket: "ticket" }),
    observe: (value) => {
      if (value.kind === "connected") ready.resolve();
    },
    onUnauthorized: () => {},
    onGenerationLost: () => {},
  });
  return {
    io,
    connection,
    ready: ready.promise,
    close: async () => {
      await connection.dispose();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
};
test("strict notice receipt reaches real SDK before unsubscribe waits, without business cursor ACK", async () => {
  const order: string[] = [];
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const receipt = Promise.withResolvers<unknown>();
  const cleanup = Promise.withResolvers<void>();
  const host = await start({
    receive: async () => null,
    notice: (value) => ({
      receipt: value,
      afterReply: () => {
        host.connection
          .command({
            version: 1,
            kind: "command",
            type: "conversations.unsubscribe",
            data: { conversationId: "one" },
            meta: { requestId: crypto.randomUUID() },
          })
          .then(() => cleanup.resolve(), cleanup.reject);
      },
    }),
  });
  host.io.on("connection", (socket) => {
    socket.on("command", async (command, reply) => {
      order.push("unsubscribe");
      entered.resolve();
      await release.promise;
      reply({
        version: 1,
        kind: "ack",
        ok: true,
        data: { conversationId: "one" },
        meta: command.meta,
      });
    });
    socket.emit("delivery.notice", notice, (value: unknown) => {
      order.push("receipt");
      receipt.resolve(value);
    });
  });
  try {
    host.connection.connect();
    expect(await receipt.promise).toEqual(notice);
    await entered.promise;
    expect(order).toEqual(["receipt", "unsubscribe"]);
    release.resolve();
    await cleanup.promise;
  } finally {
    release.resolve();
    await host.close();
  }
});
test("cleanup command waits for actual five-second SDK ACK settlement before slot reuse", async () => {
  const entered = Promise.withResolvers<void>();
  const settlement = Promise.withResolvers<void>();
  let settled = false;
  const host = await start({ receive: async () => null, notice: () => null });
  host.io.on("connection", (socket) => {
    socket
      .timeout(5000)
      .emitWithAck("event", unit)
      .then(
        () => settlement.resolve(),
        () => settlement.resolve(),
      )
      .finally(() => {
        settled = true;
      });
    socket.on("command", async (command, reply) => {
      entered.resolve();
      await settlement.promise;
      reply({
        version: 1,
        kind: "ack",
        ok: true,
        data: { conversationId: "one" },
        meta: command.meta,
      });
    });
  });
  try {
    host.connection.connect();
    await host.ready;
    const command = host.connection.command({
      version: 1,
      kind: "command",
      type: "conversations.unsubscribe",
      data: { conversationId: "one" },
      meta: { requestId: crypto.randomUUID() },
    });
    await entered.promise;
    expect(settled).toBe(false);
    expect((await command).ok).toBe(true);
    expect(settled).toBe(true);
  } finally {
    await host.close();
  }
}, 12000);
test("malformed control notice stops protocol and cannot silently ACK", async () => {
  let calls = 0;
  const invalid = Promise.withResolvers<void>();
  const host = await start({
    receive: async () => null,
    notice: () => {
      calls++;
      return null;
    },
  });
  const release = host.connection.viewState.subscribe((value) => {
    if (value.kind === "protocol-error") invalid.resolve();
  });
  host.io.on("connection", (socket) =>
    socket.emit("delivery.notice", { ...notice, extra: true }, () => {
      throw new Error("invalid receipt");
    }),
  );
  try {
    host.connection.connect();
    await invalid.promise;
    expect(calls).toBe(0);
    host.connection.resume();
    expect(get(host.connection.viewState).kind).toBe("protocol-error");
  } finally {
    release();
    await host.close();
  }
});
