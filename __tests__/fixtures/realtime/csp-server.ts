import { createServer } from "node:http";
import {
  commandSchema,
  deliveryReplyKinds,
  deliveryReplySchema,
  deliveryUnitKinds,
  deliveryUnitSchema,
  preparedSubscriptionSchema,
  realtimeChannels,
  realtimeCommandTypes,
  realtimeEventTypes,
  realtimeKinds,
  realtimePath,
  realtimeProtocolVersion,
} from "@insta/contracts/realtime";
import { Server } from "socket.io";
import { createSubscriptionServer } from "./subscriptions";

const conversationId = "012345678901234567890123";
export const startCspFixture = async () => {
  const server = createServer((request, response) => {
    if (request.url === "/api/realtime/ticket") {
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          ok: true,
          data: { ticket: crypto.randomUUID(), expiresAt: Date.now() + 30000 },
        }),
      );
      return;
    }
    response.setHeader("Content-Type", "text/html");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'nonce-owned-csp-probe'",
    );
    response.end(
      '<script nonce="owned-csp-probe">try { new Function("return 1"); document.documentElement.dataset.evalBlocked = "false"; } catch { document.documentElement.dataset.evalBlocked = "true"; }</script>',
    );
  });
  const io = new Server(server, { path: realtimePath });
  let first = true;
  let deliveryApplied = false;
  io.use((_socket, next) => {
    if (!first) {
      next();
      return;
    }
    first = false;
    next(Object.assign(new Error("Unauthorized"), { data: { status: 401 } }));
  });
  io.on("connection", (socket) => {
    const subscriptions = createSubscriptionServer();
    socket.on(
      realtimeChannels.command,
      (payload: unknown, acknowledge: unknown) => {
        const command = commandSchema.safeParse(payload);
        if (!command.success || typeof acknowledge !== "function") {
          socket.disconnect(true);
          return;
        }
        subscriptions
          .command(command.data)
          .then((ack) => {
            acknowledge(ack);
            if (!ack.ok || command.data.type !== realtimeCommandTypes.activate)
              return;
            const prepared = preparedSubscriptionSchema.parse(ack.data);
            const position = {
              ...prepared.baseline,
              subscriptionId: prepared.subscriptionId,
              cursor: prepared.baseline.cursor + 1,
            };
            const unit = deliveryUnitSchema.parse({
              kind: deliveryUnitKinds.single,
              event: {
                version: realtimeProtocolVersion,
                kind: realtimeKinds.event,
                type: realtimeEventTypes.unreadChanged,
                eventId: crypto.randomUUID(),
                occurredAt: new Date().toISOString(),
                meta: { requestId: crypto.randomUUID() },
                data: { conversationId },
                delivery: position,
              },
            });
            socket.emit(realtimeChannels.event, unit, (reply: unknown) => {
              const parsed = deliveryReplySchema.safeParse(reply);
              if (
                !parsed.success ||
                parsed.data.kind !== deliveryReplyKinds.applied
              )
                return;
              const actual = parsed.data.position;
              deliveryApplied =
                actual.subscriptionId === position.subscriptionId &&
                actual.streamId === position.streamId &&
                actual.epoch === position.epoch &&
                actual.cursor === position.cursor;
            });
          })
          .catch(() => socket.disconnect(true));
      },
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No CSP port");
  return {
    conversationId,
    deliveryApplied: () => deliveryApplied,
    url: `http://127.0.0.1:${address.port}`,
    dispose: () => new Promise<void>((resolve) => io.close(() => resolve())),
  };
};
