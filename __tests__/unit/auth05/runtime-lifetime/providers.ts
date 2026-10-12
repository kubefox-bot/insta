import { mock } from "bun:test";
import { readable } from "svelte/store";
import { conversationConnectionStates } from "../../../../apps/fe-insta/src/domains/conversations/browser/conts";
import { mountReceiptAcknowledgments } from "../../../../apps/fe-insta/src/domains/conversations/browser/receipts/lifecycle";
import { createReceiptTransport } from "../../../../apps/fe-insta/src/domains/conversations/browser/receipts/transport";
import { createConversationTransport } from "../../../../apps/fe-insta/src/domains/conversations/browser/transport";
import { createConversationSession } from "../../../../apps/fe-insta/src/domains/conversations/browser/use-cases/session";
import { conversationIssues } from "../../../../apps/fe-insta/src/domains/conversations/conts";

export const registerRuntimeProviders = () => {
  const source = (path: string) =>
    new URL(`../../../../apps/fe-insta/src/${path}`, import.meta.url).pathname;
  // Keep actual session/transport operations; avoid loading UI in a Bun probe.
  mock.module(source("domains/conversations/browser/index.ts"), () => ({
    conversationConnectionStates,
    conversationIssues,
    createConversationSession,
    createConversationTransport,
    createReceiptTransport,
    mountReceiptAcknowledgments,
  }));
  mock.module(source("domains/users/browser/index.ts"), () => ({
    searchDirectory: async () => [],
  }));
  mock.module(source("app/conversations/browser/queue.ts"), () => ({
    createConversationQueue: () => ({ outbox: {}, dispose: () => {} }),
  }));
  mock.module(source("app/conversations/browser/list.ts"), () => ({
    createConversationListRuntime: () => ({
      connected: async () => {},
      dispose: () => {},
    }),
  }));
  mock.module(source("app/conversations/browser/realtime.ts"), () => ({
    createConversationRealtime: () => ({
      connection: {
        viewState: readable({ kind: "idle" }),
        connect: () => {},
        dispose: async () => {},
      },
      connectionStatus: { idle: "connecting" },
      subscribe: async () => () => {},
    }),
  }));
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: true },
  });
};
