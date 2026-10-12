import { get } from "svelte/store";
import { createOutboxAuth } from "../../../apps/fe-insta/src/domains/conversations/browser/outbox/adapters/auth";
import { createOutboxBroadcast } from "../../../apps/fe-insta/src/domains/conversations/browser/outbox/adapters/broadcast";
import { createIndexedDbQueue } from "../../../apps/fe-insta/src/domains/conversations/browser/outbox/adapters/indexed-db";
import { mountOutbox } from "../../../apps/fe-insta/src/domains/conversations/browser/outbox/adapters/mount";
import { createOutboxSender } from "../../../apps/fe-insta/src/domains/conversations/browser/outbox/adapters/sender";
import { createOutboxLocks } from "../../../apps/fe-insta/src/domains/conversations/browser/outbox/adapters/web-lock";
import type { QueuedMessage } from "../../../apps/fe-insta/src/domains/conversations/browser/outbox/domain/types";
import { createOutbox } from "../../../apps/fe-insta/src/domains/conversations/browser/outbox/store";
import { confirmResume } from "../../../apps/fe-insta/src/domains/conversations/browser/outbox/use-cases/confirm-resume";
import { drain } from "../../../apps/fe-insta/src/domains/conversations/browser/outbox/use-cases/drain";
import { enqueue } from "../../../apps/fe-insta/src/domains/conversations/browser/outbox/use-cases/enqueue";
import { createAuthBrowser } from "../../../apps/fe-insta/src/domains/users/browser/store";
import { readBrowserSession } from "../../../apps/fe-insta/src/domains/users/browser/transport";
import { createConnectionProbe } from "./connection";
import { holdOwnedCommit } from "./hold-commit";
import { createReadBarrier } from "./hold-read";
import { failOwnedWrite } from "./quota";

const state = {
  queue: createIndexedDbQueue({ factory: indexedDB }),
  databaseName: undefined as string | undefined,
  actor: { ownerId: "owner", generation: "g1" },
  auth: undefined as ReturnType<typeof createAuthBrowser> | undefined,
  now: 0,
  conversationId: "a".repeat(24),
  withoutLocks: false,
  sendCalls: 0,
  sendBarrier: undefined as ReturnType<typeof createReadBarrier> | undefined,
  readCalls: 0,
  readBarrier: undefined as ReturnType<typeof createReadBarrier> | undefined,
  commitBarrier: undefined as ReturnType<typeof holdOwnedCommit> | undefined,
  deleteBarrier: undefined as ReturnType<typeof createReadBarrier> | undefined,
  drainController: undefined as AbortController | undefined,
  notices: [] as unknown[],
  rawChannel: undefined as BroadcastChannel | undefined,
  automaticCleanup: undefined as (() => void) | undefined,
  confirmation: undefined as ReturnType<typeof createOutbox> | undefined,
  automaticIssues: [] as string[],
  broadcast: undefined as ReturnType<typeof createOutboxBroadcast> | undefined,
  cleanup: undefined as (() => void) | undefined,
};
const createConfirmation = (auth: ReturnType<typeof createOutboxAuth>) => {
  const sender = createOutboxSender();
  return createOutbox({
    queue: state.queue,
    auth,
    sender: (record, options) => {
      state.sendCalls++;
      return sender(record, options);
    },
    locks: createOutboxLocks(navigator.locks),
    changes: createOutboxBroadcast(),
    clock: () => state.now,
    jitter: () => 0,
  });
};
const connectionProbe = createConnectionProbe();
const probe = {
  connection: connectionProbe,
  start: (name: string) => {
    state.queue.close();
    state.databaseName = name;
    state.queue = createIndexedDbQueue({
      factory: indexedDB,
      databaseName: name,
    });
  },
  connect: async (
    name: string,
    conversationId: string,
    withoutLocks = false,
  ) => {
    probe.start(name);
    state.conversationId = conversationId;
    state.withoutLocks = withoutLocks;
    const actor = await readBrowserSession();
    if (!actor) throw new Error("Actual browser session missing");
    state.actor = { ownerId: actor.userId, generation: actor.generation };
    state.auth = createAuthBrowser({
      initial: { actor, status: "authenticated" },
      read: readBrowserSession,
      clearPrivate: () => {},
      synchronization: {
        exclusive: async <T>(run: () => Promise<T>) => run(),
        publish: () => {},
        subscribe: () => () => {},
      },
    });
    const owned = state.auth;
    state.cleanup = owned.registerLogout(async (previous) => {
      if (previous) {
        const cleared = await state.queue.clear(previous.userId);
        if (cleared.isError()) throw new Error(cleared.getError());
      }
    });
    return state.actor;
  },
  enqueue: async (text = "persisted draft") => {
    const queued = await enqueue(
      {
        ownerId: state.actor.ownerId,
        authGeneration: state.actor.generation,
        conversationId: state.conversationId,
        text,
      },
      {
        queue: state.queue,
        clock: () => state.now,
        uuid: () => crypto.randomUUID(),
      },
    );
    return queued.isOk()
      ? { ok: true, record: queued.get() }
      : { ok: false, error: queued.getError() };
  },
  list: async (ownerId = state.actor.ownerId) => {
    const value = await state.queue.list(ownerId);
    if (value.isError()) throw new Error(value.getError());
    return value.get();
  },
  drain: async () => {
    if (!state.auth) throw new Error("Probe auth missing");
    const current = get(state.auth.view).actor;
    if (!current) throw new Error("Probe actor missing");
    const sender = createOutboxSender();
    const ownedAuth = createOutboxAuth(state.auth);
    const controller = new AbortController();
    state.drainController = controller;
    return drain(
      {
        ownerId: current.userId,
        authGeneration: current.generation,
        now: state.now,
      },
      {
        queue: state.deleteBarrier
          ? {
              ...state.queue,
              remove: async (record) => {
                await state.deleteBarrier?.wait();
                return state.queue.remove(record);
              },
            }
          : state.queue,
        signal: controller.signal,
        auth: {
          ...ownedAuth,
          reconcile: async (options) => {
            state.readCalls++;
            if (state.readCalls === 2 && state.readBarrier)
              await state.readBarrier.wait(options?.signal);
            await ownedAuth.reconcile(options);
          },
        },
        locks: createOutboxLocks(
          state.withoutLocks ? undefined : navigator.locks,
        ),
        clock: () => state.now,
        jitter: () => 0,
        sender: async (record, options) => {
          await state.sendBarrier?.wait(options?.signal);
          state.sendCalls++;
          return sender(record, options);
        },
      },
    );
  },
  holdPostRead: () => {
    state.readCalls = 0;
    state.readBarrier = createReadBarrier();
  },
  holdSend: () => {
    state.sendBarrier = createReadBarrier();
  },
  sendStarted: () => state.sendBarrier?.started() ?? false,
  releaseSend: () => state.sendBarrier?.release(),
  postReadStarted: () => state.readBarrier?.started() ?? false,
  releasePostRead: () => state.readBarrier?.release(),
  abortDrain: () => state.drainController?.abort(),
  holdDelete: () => {
    state.deleteBarrier = createReadBarrier();
  },
  deleteStarted: () => state.deleteBarrier?.started() ?? false,
  releaseDelete: () => state.deleteBarrier?.release(),
  holdConfirmation: () => {
    if (!state.auth) throw new Error("Probe auth missing");
    const barrier = createReadBarrier();
    state.readBarrier = barrier;
    const ownedAuth = createOutboxAuth(state.auth);
    state.confirmation = createConfirmation({
      ...ownedAuth,
      reconcile: async (options) => {
        await barrier.wait(options?.signal);
        await ownedAuth.reconcile(options);
      },
    });
  },
  holdConfirmationCommit: () => {
    if (!state.auth || !state.databaseName)
      throw Error("Owned confirmation missing");
    state.commitBarrier = holdOwnedCommit(state.databaseName);
    state.confirmation = createConfirmation(createOutboxAuth(state.auth));
  },
  commitStarted: () => state.commitBarrier?.started() ?? false,
  commitOutcome: () => state.commitBarrier?.outcome(),
  releaseCommit: () => state.commitBarrier?.release(),
  confirmHeld: async (operationIds: string[]) => {
    if (!state.confirmation) throw new Error("Probe confirmation missing");
    const result = await state.confirmation.confirmResume(operationIds);
    return result.isOk()
      ? { ok: true, count: result.get() }
      : { ok: false, error: result.getError() };
  },
  disposeConfirmation: () => state.confirmation?.dispose(),
  confirm: async (operationIds: string[]) => {
    if (!state.auth) throw new Error("Probe auth missing");
    const result = await confirmResume(
      { ownerId: state.actor.ownerId, operationIds },
      { queue: state.queue, auth: createOutboxAuth(state.auth) },
    );
    return result.isOk() ? result.get() : result.getError();
  },
  reconcile: async () => {
    await state.auth?.reconcile();
    return state.auth ? get(state.auth.view).actor : null;
  },
  logout: async () => {
    await state.auth?.beginLogout();
  },
  now: (now: number) => {
    state.now = now;
  },
  sendCalls: () => state.sendCalls,
  canLock: () =>
    navigator.locks.request(
      `insta:outbox:${state.actor.ownerId}`,
      { ifAvailable: true },
      (lock) => Boolean(lock),
    ),
  mutate: async (record: QueuedMessage) => {
    const updated = await state.queue.update(
      {
        ...record,
        text: "changed",
        key: "changed",
        clientMessageId: "changed",
        createdAt: 123,
        revision: record.revision + 1,
      },
      record.revision,
    );
    return updated.isOk() && updated.get();
  },
  startAutomatic: () => {
    if (!state.auth) throw new Error("Probe auth missing");
    const owned = createOutbox({
      queue: state.queue,
      sender: createOutboxSender(),
      auth: createOutboxAuth(state.auth),
      locks: createOutboxLocks(navigator.locks),
      changes: createOutboxBroadcast(),
      clock: () => state.now,
      jitter: () => 0,
    });
    state.automaticCleanup = mountOutbox({
      outbox: owned,
      onError: () => state.automaticIssues.push("wake failed"),
    });
  },
  automaticIssues: () => state.automaticIssues,
  focus: () => window.dispatchEvent(new Event("focus")),
  storageFailure: (namespace: string) => failOwnedWrite(namespace),
  listenNotices: () => {
    state.rawChannel = new BroadcastChannel("insta-conversations-outbox");
    state.rawChannel.onmessage = (event) => state.notices.push(event.data);
  },
  publishNotice: () => {
    state.broadcast = createOutboxBroadcast();
    state.broadcast.publish();
  },
  notices: () => state.notices,
  close: () => {
    connectionProbe.close();
    state.sendBarrier?.release();
    state.readBarrier?.release();
    state.deleteBarrier?.release();
    state.commitBarrier?.release();
    state.drainController?.abort();
    state.confirmation?.dispose();
    state.automaticCleanup?.();
    state.cleanup?.();
    state.broadcast?.close();
    state.rawChannel?.close();
    state.queue.close();
  },
};
declare global {
  interface Window {
    __outboxProbe: typeof probe;
  }
}
window.__outboxProbe = probe;
