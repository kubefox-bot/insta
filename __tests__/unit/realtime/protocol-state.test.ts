import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { RealtimeErrorCode } from "@insta/contracts/realtime";
import { Server } from "socket.io";
import { get } from "svelte/store";
import { attachConversationConnection } from "../../../apps/fe-insta/src/app/conversations/browser/connect";
import { connectionStatus } from "../../../apps/fe-insta/src/app/conversations/browser/conts";
import { retrySelectedSubscription } from "../../../apps/fe-insta/src/app/conversations/browser/recovery";
import { createApplicationRealtime } from "../../../apps/fe-insta/src/app/realtime/browser/create";
import {
  createConversationSession,
  createConversationStore,
} from "../../../apps/fe-insta/src/domains/conversations/browser/index";
import { createAuthBrowser } from "../../../apps/fe-insta/src/domains/users/browser/store";
import { messages } from "../../../apps/fe-insta/src/lib/i18n/index";
import { realtimeErrorCopy } from "../../../apps/fe-insta/src/lib/realtime/index";

test.each(["malformed-notice", "unsupported-command"])(
  "actual %s preserves public protocol error and explicit action reloads instead of retrying stopped transport",
  async (mode) => {
    const server = createServer();
    const io = new Server(server, { path: "/event" });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No listener");
    const originalFetch = globalThis.fetch;
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "navigator",
    );
    let requests = 0;
    globalThis.fetch = Object.assign(async () => {
      requests++;
      return Response.json({
        ok: true,
        data: { ticket: crypto.randomUUID(), expiresAt: Date.now() + 30000 },
      });
    }, originalFetch);
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: true },
      configurable: true,
    });
    const actor = { userId: "alice", username: "Alice", generation: "one" };
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
    const store = createConversationStore({ actor, initial: [] });
    const session = createConversationSession({
      actor,
      store,
      currentActor: () => actor,
      subscribe: async () => () => {},
      history: async () => ({
        items: [],
        baselineCursor: 0,
        watermark: 0,
        pageInfo: { hasMore: false, nextCursor: null },
      }),
      start: async () => {
        throw new Error("unused");
      },
      openConversation: async () => {},
    });
    const connected = Promise.withResolvers<void>();
    const invalid = Promise.withResolvers<void>();
    const connection = createApplicationRealtime({
      url: `http://127.0.0.1:${address.port}`,
      auth,
      handlers: {
        "messages.created": () => "stale",
        "messages.receipts.updated": () => "stale",
        "conversations.unread.changed": () => "stale",
      },
      delivery: { receive: async () => null, notice: () => null },
      onGenerationLost: () => {},
      observe: (kind) => {
        if (kind === "connected") connected.resolve();
        if (kind === "invalid") invalid.resolve();
      },
    });
    const release = attachConversationConnection({
      store,
      session,
      connection,
      connectionStatus,
      connected: async () => {},
    });
    io.on("connection", (socket) => {
      if (mode === "malformed-notice")
        socket.emit("delivery.notice", { bad: true }, () => {});
      socket.on("command", (command, reply) =>
        reply({
          version: 1,
          kind: "ack",
          ok: false,
          error: {
            code: RealtimeErrorCode.ProtocolUnsupported,
            message: "unsupported",
          },
          meta: command.meta,
        }),
      );
    });
    try {
      connection.connect();
      await connected.promise;
      if (mode === "unsupported-command")
        await connection.command({
          version: 1,
          kind: "command",
          type: "conversations.unread.subscribe",
          data: {},
          meta: { requestId: crypto.randomUUID() },
        });
      await invalid.promise;
      expect(get(connection.viewState)).toMatchObject({
        kind: "protocol-error",
        issue: RealtimeErrorCode.ProtocolUnsupported,
      });
      const view = get(store.view);
      expect(view.connectionIssue).toBe(RealtimeErrorCode.ProtocolUnsupported);
      if (!view.connectionIssue)
        throw new Error("Missing public protocol error");
      for (const copy of [messages.en, messages.ru])
        expect(realtimeErrorCopy({ code: view.connectionIssue, copy })).toBe(
          copy.errors.protocolUnsupported,
        );
      connection.resume();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(requests).toBe(1);
      store.select("c");
      let reloads = 0;
      let retries = 0;
      let resumes = 0;
      retrySelectedSubscription({
        store,
        retry: () => {
          retries++;
        },
        connection: {
          resume: () => {
            resumes++;
          },
        },
        reload: () => {
          reloads++;
        },
      });
      expect({ reloads, retries, resumes }).toEqual({
        reloads: 1,
        retries: 0,
        resumes: 0,
      });
    } finally {
      release();
      await connection.dispose();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      globalThis.fetch = originalFetch;
      if (navigatorDescriptor)
        Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
      else Reflect.deleteProperty(globalThis, "navigator");
    }
  },
);
