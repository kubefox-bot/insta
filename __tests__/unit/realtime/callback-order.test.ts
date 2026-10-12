import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { createConnection } from "../../../apps/fe-insta/src/lib/realtime/connection";

const position = {
  subscriptionId: crypto.randomUUID(),
  streamId: "conversation:one",
  epoch: crypto.randomUUID(),
  cursor: 1,
};
const event = {
  version: 1,
  kind: "event",
  type: "conversations.unread.changed",
  eventId: crypto.randomUUID(),
  occurredAt: "2026-10-20T00:00:00.000Z",
  data: { conversationId: "one" },
  meta: { requestId: crypto.randomUUID() },
  delivery: position,
};
test("transport returns business retry-later before owned recovery launch and accepts strict control receipt", async () => {
  const server = createServer();
  const io = new Server(server, { path: "/event" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  const result = Promise.withResolvers<unknown>();
  const order: string[] = [];
  io.on("connection", (socket) => {
    socket
      .timeout(100)
      .emit(
        "event",
        { kind: "single", event },
        (error: Error | null, reply: unknown) => result.resolve(error ?? reply),
      );
  });
  const connection = createConnection({
    url: `http://127.0.0.1:${address.port}`,
    obtainTicket: async () => ({ kind: "issued", ticket: "ticket" }),
    handlers: {
      "messages.created": async () => "stale" as const,
      "messages.receipts.updated": async () => "stale" as const,
      "conversations.unread.changed": async () => "stale" as const,
    },
    delivery: {
      receive: async () => ({
        reply: { kind: "retry-later", position },
        afterReply: () => order.push("launch"),
      }),
      notice: () => null,
    },
    observe: () => {},
    onUnauthorized: () => {},
    onGenerationLost: () => {},
  });
  try {
    connection.connect();
    expect(await result.promise).toEqual({ kind: "retry-later", position });
    expect(order).toEqual(["launch"]);
  } finally {
    await connection.dispose();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  }
});
