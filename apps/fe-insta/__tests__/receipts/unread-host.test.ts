import { expect, test } from "bun:test";
import { ackSchema, eventSchema } from "@insta/contracts/realtime";
import { get, writable } from "svelte/store";
import { createSubscriptionServer } from "../../../../__tests__/fixtures/realtime/subscriptions";
import { createRealtimeHost } from "../../src/app/realtime/browser/host";
import { createUnreadSummary } from "../../src/domains/conversations/browser/unread/create";
import { createAuthBrowser } from "../../src/domains/users/browser/store";
import { connectionStates } from "../../src/lib/realtime/conts";
import type {
  ConnectionState,
  EventHandlers,
} from "../../src/lib/realtime/types";

test("root owns one socket across route detach, account switch and offline recovery; successful healthy focus never reconnects", async () => {
  const actor = { userId: "alice", username: "Alice", generation: "login1" };
  const auth = createAuthBrowser({
    initial: { actor, status: "authenticated" },
    read: async () => actor,
    clearPrivate: () => {},
    synchronization: {
      exclusive: (execute) => execute(),
      publish: () => {},
      subscribe: () => () => {},
    },
  });
  const unread = createUnreadSummary({
    visible: () => true,
    load: async () => ({ items: [], totalUnreadCount: 0 }),
  });
  const releaseIdentity = auth.view.subscribe((value) =>
    unread.reconcileActor(value.actor),
  );
  const sockets: Array<{
    state: ReturnType<typeof writable<ConnectionState>>;
    handlers: EventHandlers;
    connects: number;
    disposals: number;
    commands: number;
  }> = [];
  const host = createRealtimeHost({
    auth,
    unread,
    origin: () => "https://localhost",
    uuid: () => crypto.randomUUID(),
    create: (options) => {
      const server = createSubscriptionServer();
      const socket = {
        state: writable<ConnectionState>({
          kind: connectionStates.idle,
          generation: 0,
        }),
        handlers: options.handlers,
        connects: 0,
        disposals: 0,
        commands: 0,
      };
      sockets.push(socket);
      return {
        viewState: socket.state,
        connect: () => {
          socket.connects++;
          socket.state.set({
            kind: connectionStates.connecting,
            generation: socket.connects,
          });
        },
        resume: () => {
          const kind = get(socket.state).kind;
          if (kind !== "connected" && kind !== "connecting") {
            socket.connects++;
            socket.state.set({
              kind: "connecting",
              generation: socket.connects,
            });
          }
        },
        command: async (command) => {
          socket.commands++;
          return server.command(command);
        },
        dispose: async () => {
          socket.disposals++;
          options.onGenerationLost();
        },
      };
    },
  });
  const window = new EventTarget();
  const visibility = Object.assign(new EventTarget(), {
    visibilityState: "visible" as DocumentVisibilityState,
  });
  const release = host.mount({ window, visibility });
  const socket = sockets[0];
  if (!socket) throw new Error("Missing socket");
  socket.state.set({ kind: connectionStates.connected, generation: 1 });
  await Promise.resolve();
  await Promise.resolve();
  let received = 0;
  let lost = 0;
  const handlers: EventHandlers = {
    "messages.created": () => {
      received++;
      return "applied" as const;
    },
    "messages.receipts.updated": () => "stale" as const,
    "conversations.unread.changed": () => "stale" as const,
  };
  const borrowed = host.borrow({
    actor,
    handlers,
    onGenerationLost: () => {
      lost++;
    },
  });
  borrowed.connect();
  expect(socket.connects).toBe(1);
  await borrowed.dispose();
  expect(socket.disposals).toBe(0);
  expect(lost).toBe(1);
  window.dispatchEvent(new Event("focus"));
  visibility.dispatchEvent(new Event("visibilitychange"));
  expect(socket.connects).toBe(1);
  expect(sockets).toHaveLength(1);
  socket.state.set({ kind: connectionStates.exhausted, generation: 2 });
  window.dispatchEvent(new Event("online"));
  expect(socket.connects).toBe(2);
  window.dispatchEvent(new Event("focus"));
  expect(socket.connects).toBe(2);
  const old = host.borrow({
    actor,
    handlers,
    onGenerationLost: () => {
      lost++;
    },
  });
  auth.accept({ ...actor, generation: "login2" });
  expect(socket.disposals).toBe(1);
  expect(sockets).toHaveLength(2);
  await expect(
    old.command({
      version: 1,
      kind: "command",
      type: "conversations.unread.subscribe",
      data: {},
      meta: { requestId: crypto.randomUUID() },
    }),
  ).rejects.toThrow("actor changed");
  const event = eventSchema.parse({
    version: 1,
    kind: "event",
    type: "messages.created",
    delivery: {
      subscriptionId: crypto.randomUUID(),
      streamId: "conversation",
      epoch: crypto.randomUUID(),
      cursor: 1,
    },
    eventId: crypto.randomUUID(),
    occurredAt: "2026-10-12T00:00:00.000Z",
    data: {
      message: {
        id: "m".repeat(24),
        conversationId: "c".repeat(24),
        authorId: "u".repeat(24),
        text: "Hi",
        sequence: 1,
        createdAt: "2026-10-12T00:00:00.000Z",
      },
    },
    meta: { requestId: crypto.randomUUID() },
  });
  if (event.type === "messages.created")
    sockets[1]?.handlers[event.type](event);
  expect(received).toBe(0);
  release();
  expect(sockets[1]?.disposals).toBe(1);
  window.dispatchEvent(new Event("online"));
  expect(sockets[1]?.connects).toBe(1);
  releaseIdentity();
  unread.dispose();
});

test("foreground retries a failed unread ACK on the same healthy socket", async () => {
  const actor = { userId: "alice", username: "Alice", generation: "login1" };
  const auth = createAuthBrowser({
    initial: { actor, status: "authenticated" },
    read: async () => actor,
    clearPrivate: () => {},
    synchronization: {
      exclusive: (execute) => execute(),
      publish: () => {},
      subscribe: () => () => {},
    },
  });
  const unread = createUnreadSummary({
    visible: () => true,
    load: async () => ({ items: [], totalUnreadCount: 0 }),
  });
  unread.reconcileActor(actor);
  const state = writable<ConnectionState>({
    kind: connectionStates.idle,
    generation: 0,
  });
  let connects = 0;
  let commands = 0;
  const attempted = Promise.withResolvers<void>();
  const activated = Promise.withResolvers<void>();
  const server = createSubscriptionServer({
    after: async (command) => {
      if (command.type === "conversations.activate") activated.resolve();
    },
  });
  const host = createRealtimeHost({
    auth,
    unread,
    origin: () => "https://localhost",
    uuid: () => crypto.randomUUID(),
    create: () => ({
      viewState: state,
      resume: () => {},
      connect: () => {
        connects++;
        state.set({ kind: connectionStates.connected, generation: 1 });
      },
      command: async (command) => {
        commands++;
        attempted.resolve();
        if (commands === 1)
          return ackSchema.parse({
            version: 1,
            kind: "ack",
            ok: false,
            error: { code: "SERVICE_UNAVAILABLE", message: "Unavailable" },
            meta: command.meta,
          });
        return server.command(command);
      },
      dispose: async () => {},
    }),
  });
  const window = new EventTarget();
  const visibility = Object.assign(new EventTarget(), {
    visibilityState: "visible" as DocumentVisibilityState,
  });
  const release = host.mount({ window, visibility });
  await attempted.promise;
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(commands).toBe(1);
  window.dispatchEvent(new Event("focus"));
  await activated.promise;
  expect(commands).toBe(3);
  expect(connects).toBe(1);
  window.dispatchEvent(new Event("focus"));
  expect(commands).toBe(3);
  release();
  unread.dispose();
});
