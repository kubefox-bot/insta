import { preparedSubscriptionSchema } from "@insta/contracts/realtime";
import { io, type Socket } from "socket.io-client";
import { get } from "svelte/store";
import { obtainWsTicket } from "../../../apps/fe-insta/src/domains/users/browser/ws-ticket";
import {
  applyDelivery,
  connectionStates,
  createConnection,
  DeliveryCursorStore,
  dispatchEvent,
} from "../../../apps/fe-insta/src/lib/realtime/index";

const cursor = new DeliveryCursorStore();
const observations: string[] = [];
const eventIds: string[] = [];
const requestIds: string[] = [];
let ticketRequests = 0;
let generationLosses = 0;
let invalidations = 0;
let subscribed = 0;
let unauthorized = 0;
let currentSocket: Socket | undefined;
let activeConversation = "";
const handlers = {
  "messages.receipts.updated": () => "applied" as const,
  "messages.created": (
    event: Parameters<
      Parameters<typeof dispatchEvent>[0]["handlers"]["messages.created"]
    >[0],
  ) => {
    eventIds.push(event.eventId);
    requestIds.push(event.meta.requestId);
    return "applied" as const;
  },
  "conversations.unread.changed": () => {
    invalidations++;
    return "applied" as const;
  },
};
const createProbeConnection = (): ReturnType<typeof createConnection> =>
  createConnection({
    url: location.origin,
    handlers,
    delivery: {
      receive: async (unit, active) => {
        if (unit.kind !== "single") return null;
        return applyDelivery(
          {
            event: unit.event,
            currentActor: active,
            apply: async () => {
              const outcome = await dispatchEvent({
                payload: unit.event,
                handlers,
                observe: (value) => observations.push(value.kind),
              });
              if (outcome === "invalid") throw new Error("Invalid event");
              return outcome;
            },
          },
          cursor,
        );
      },
      notice: (notice, active) =>
        active() && cursor.owns(notice) ? { receipt: notice } : null,
    },
    obtainTicket: (signal) => {
      ticketRequests++;
      return obtainWsTicket(signal);
    },
    createSocket: (url, options) => {
      const socket = io(url, options);
      currentSocket = socket;
      return socket;
    },
    observe: (value) => {
      observations.push(value.kind);
      if (value.kind === "connected")
        connection
          .command({
            version: 1,
            kind: "command",
            type: "conversations.subscribe",
            data: {
              conversationId: activeConversation,
              ...(cursor.position()
                ? { resume: cursor.position() ?? undefined }
                : {}),
            },
            meta: { requestId: crypto.randomUUID() },
          })
          .then(
            async (ack) => {
              if (!ack.ok || !("subscriptionId" in ack.data))
                throw new Error("Subscription failed");
              const prepared = preparedSubscriptionSchema.parse(
                {
                  subscriptionId: ack.data.subscriptionId,
                  baseline: ack.data.baseline,
                },
                { jitless: true },
              );
              cursor.bind(prepared);
              const activated = await connection.command({
                version: 1,
                kind: "command",
                type: "conversations.activate",
                data: prepared,
                meta: { requestId: crypto.randomUUID() },
              });
              if (activated.ok) subscribed++;
            },
            () => observations.push("subscription_error"),
          )
          .catch(() => observations.push("subscription_error"));
    },
    onUnauthorized: () => {
      unauthorized++;
    },
    onGenerationLost: () => {
      generationLosses++;
      cursor.lost();
    },
  });
let connection = createProbeConnection();
const probe = {
  connect: async (id: string) => {
    if (get(connection.viewState).kind === connectionStates.unauthorized) {
      await connection.dispose();
      connection = createProbeConnection();
    }
    activeConversation = id;
    connection.connect();
  },
  cutTransport: () => currentSocket?.io.engine.close(),
  dispose: () => connection.dispose(),
  snapshot: () => ({
    observations: [...observations],
    eventIds: [...eventIds],
    requestIds: [...requestIds],
    ticketRequests,
    generationLosses,
    invalidations,
    subscribed,
    unauthorized,
    transport: currentSocket?.io.engine.transport.name,
  }),
  invalidation: () =>
    dispatchEvent({
      handlers,
      observe: (value) => observations.push(value.kind),
      payload: {
        version: 1,
        kind: "event",
        type: "conversations.unread.changed",
        delivery: {
          subscriptionId: crypto.randomUUID(),
          streamId: "probe",
          epoch: crypto.randomUUID(),
          cursor: 1,
        },
        eventId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        meta: { requestId: crypto.randomUUID() },
        data: { conversationId: activeConversation },
      },
    }),
};
declare global {
  interface Window {
    __realtimeProbe: typeof probe;
  }
}
window.__realtimeProbe = probe;
