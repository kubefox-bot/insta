import { expect, test } from "bun:test";
import { deliveryUnitSchema } from "@insta/contracts/realtime";
import { io, type Socket } from "socket.io-client";
import { waitUntil } from "../../../../../__tests__/fixtures/barrier";
import { dispatchMessageOutbox } from "../../../src/domains/conversations/index";
import { readRealtimeConfig } from "../../../src/lib/config/index";
import {
  activatePrepared,
  realtimeCommand,
} from "../../fixtures/realtime/client";
import { createReceiptHttpFixture } from "../../fixtures/receipts/http";

/** Моделирует потерю последнего события/его ACK; assertions относятся к серверному retry, не к FE UI. */
const receive = ({
  payload,
  ack,
  index,
  deliveries,
  applied,
  appliedPositions,
}: Readonly<{
  payload: unknown;
  ack: (reply: unknown) => void;
  index: number;
  deliveries: unknown[][];
  applied: number[];
  appliedPositions: Set<string>;
}>) => {
  const unit = deliveryUnitSchema.parse(payload);
  const event = unit.kind === "single" ? unit.event : unit.events.at(-1);
  if (!event) throw new Error("Missing unit");
  const received = deliveries[index];
  if (!received) throw new Error("Missing subscriber");
  received.push(event.delivery);
  if (index === 0 && received.length === 1) return; // only last event lost
  const key = JSON.stringify(event.delivery);
  if (!appliedPositions.has(key)) {
    appliedPositions.add(key);
    applied[index] = (applied[index] ?? 0) + 1;
  }
  if (index === 0 && received.length === 2) return; // applied, only ACK lost
  ack({ kind: "applied", position: event.delivery });
};

test("last message and lost ACK retry without another publish; neighboring subscriber advances", async () => {
  const f = await createReceiptHttpFixture({
    policy: {
      ...readRealtimeConfig({}),
      ackTimeoutMs: 100,
      deliveryRetryBaseMs: 20,
      deliveryRetryCapMs: 40,
    },
  });
  const sockets: Socket[] = [];
  try {
    const alice = await f.signIn();
    const bob = await f.signIn();
    const pair = await f.chat.conversations.conversations.startPair({
      participantIds: [alice.user.id, bob.user.id],
      operationId: f.operation(),
    });
    if (pair.isError()) throw new Error(pair.getError());
    const id = pair.get().conversation.id;
    const deliveries: unknown[][] = [[], []];
    const applied = [0, 0];
    const appliedPositions = new Set<string>();
    for (let index = 0; index < 2; index++) {
      const response = await fetch(`${f.url}/v1/auth/ws-ticket`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${bob.accessToken}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      expect(response.status).toBe(200);
      const socket = io(f.url, {
        path: "/event",
        transports: ["websocket"],
        auth: { ticket: (await response.json()).data.ticket },
        extraHeaders: { origin: "https://localhost" },
        reconnection: false,
        forceNew: true,
      });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      socket.on("event", (payload: unknown, ack: (reply: unknown) => void) =>
        receive({ payload, ack, index, deliveries, applied, appliedPositions }),
      );
      const prepared = await realtimeCommand(
        socket,
        "conversations.subscribe",
        { conversationId: id },
      );
      expect(prepared.ok).toBe(true);
      const snapshot = await fetch(`${f.url}/v1/conversations/${id}/messages`, {
        headers: { authorization: `Bearer ${bob.accessToken}` },
      });
      expect(snapshot.status).toBe(200);
      await activatePrepared(socket, prepared);
    }
    const created = await fetch(`${f.url}/v1/conversations/${id}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${alice.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "Synthetic last message" }),
    });
    expect(created.status).toBe(200);
    await dispatchMessageOutbox({
      outbox: f.chat.realtime.outbox,
      sinks: { realtime: f.chat.realtime.publishers.message },
      clock: Date.now,
      uuid: () => crypto.randomUUID(),
    });
    await waitUntil({
      check: async () => (deliveries[0]?.length ?? 0) >= 3 && applied[1] === 1,
      timeoutMs: 10000,
    });
    expect(deliveries[0]?.[0]).toEqual(deliveries[0]?.[1]);
    expect(deliveries[0]?.[1]).toEqual(deliveries[0]?.[2]);
    expect(applied).toEqual([1, 1]);
    expect(deliveries[1]).toHaveLength(1);
    const source = await f.db
      .collection("conversations_outbox")
      .findOne({ conversationId: id });
    expect(source?.deliveries.realtime.state).toBe("delivered");
  } finally {
    for (const socket of sockets) socket.disconnect();
    await f.close();
  }
}, 30000);
