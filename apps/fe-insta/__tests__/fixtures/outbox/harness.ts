import type { QueueActor } from "../../../src/domains/conversations/browser/outbox/domain/types";
import type { OutboxAuth } from "../../../src/domains/conversations/browser/outbox/ports/auth";
import type { Queue } from "../../../src/domains/conversations/browser/outbox/ports/queue";
import type { Sender } from "../../../src/domains/conversations/browser/outbox/ports/sender";
import { createOutbox } from "../../../src/domains/conversations/browser/outbox/store";
import { memoryQueue } from "./memory";
export const outboxHarness = ({
  sender,
  reconcile,
  queue = memoryQueue(),
}: Readonly<{
  sender: Sender;
  queue?: Queue;
  reconcile?: OutboxAuth["reconcile"];
}>) => {
  const state: {
    actor: QueueActor | null;
    now: number;
    recoverActor?: QueueActor;
  } = {
    actor: { ownerId: "owner", generation: "g1" },
    now: 0,
  };
  const changed = new Set<() => void>();
  const logoutCallbacks = new Set<
    (actor: QueueActor | null) => Promise<void>
  >();
  const outbox = createOutbox({
    queue,
    sender,
    clock: () => state.now,
    uuid: () => crypto.randomUUID(),
    jitter: () => 0,
    locks: { run: async <T>(_owner: string, run: () => Promise<T>) => run() },
    changes: { publish: () => {}, subscribe: () => () => {}, close: () => {} },
    auth: {
      current: () => state.actor,
      online: () => true,
      reconcile:
        reconcile ??
        (async () => {
          if (state.recoverActor) state.actor = state.recoverActor;
        }),
      subscribe: (callback) => {
        changed.add(callback);
        return () => changed.delete(callback);
      },
      registerLogout: (callback) => {
        logoutCallbacks.add(callback);
        return () => logoutCallbacks.delete(callback);
      },
    },
  });
  return {
    outbox,
    queue,
    state,
    change: (actor: QueueActor) => {
      state.actor = actor;
      for (const callback of changed) callback();
    },
    logout: async () => {
      const actor = state.actor;
      state.actor = null;
      for (const callback of changed) callback();
      await Promise.all(
        [...logoutCallbacks].map((callback) => callback(actor)),
      );
    },
  };
};
