import {
  deliveryUnitSchema,
  eventSchema,
  maxUnreadBatchSize,
} from "@insta/contracts/realtime";
import { z } from "zod";
import {
  createConversationTransport,
  createUnreadSummary,
} from "../../../../apps/fe-insta/src/domains/conversations/browser/index";
import { createUnreadSubscription } from "../../../../apps/fe-insta/src/domains/conversations/browser/realtime/index";
import { createSubscriptionServer } from "../../realtime/subscriptions";

/** Проверяет реальные summary/subscription owners и BFF; prepare/activate контролируются fixture, это не доказательство native WS. */
const runUnreadBatchProbe = async () => {
  const session = z
    .object({ data: z.object({ userId: z.string(), generation: z.string() }) })
    .parse(await (await fetch("/api/session")).json(), { jitless: true });
  const actor = session.data;
  const state = { reads: 0 };
  const transport = createConversationTransport({
    actor,
    request: async (url, init) => {
      state.reads++;
      return fetch(url, init);
    },
  });
  const unread = createUnreadSummary({
    visible: () => true,
    load: (_actor, signal) => transport.list(signal),
  });
  const server = createSubscriptionServer();
  unread.reconcileActor(actor);
  const subscription = createUnreadSubscription({
    unread,
    command: server.command,
    uuid: () => crypto.randomUUID(),
  });
  try {
    await subscription.connected();
    const baselineReads = state.reads;
    const prepared = server.slots.get("#unread");
    if (!prepared) throw new Error("Unread prepare missing");
    const events = Array.from({ length: 640 }, (_, index) =>
      eventSchema.parse(
        {
          version: 1,
          kind: "event",
          type: "conversations.unread.changed",
          eventId: crypto.randomUUID(),
          occurredAt: new Date().toISOString(),
          meta: { requestId: crypto.randomUUID() },
          data: { conversationId: "fixture_conversation" },
          delivery: {
            ...prepared.baseline,
            subscriptionId: prepared.subscriptionId,
            cursor: index + 1,
          },
        },
        { jitless: true },
      ),
    );
    const replies = [];
    for (let offset = 0; offset < events.length; offset += maxUnreadBatchSize) {
      const unit = deliveryUnitSchema.parse(
        {
          kind: "unread-batch",
          events: events.slice(offset, offset + maxUnreadBatchSize),
        },
        { jitless: true },
      );
      const result = await subscription.delivery.receive(unit, () => true);
      if (result?.reply.kind !== "applied")
        throw new Error("Actual summary failed to apply batch");
      replies.push(result.reply.position.cursor);
    }
    const canonicalReads = state.reads - baselineReads;
    const replay = await subscription.delivery.receive(
      deliveryUnitSchema.parse(
        {
          kind: "unread-batch",
          events: events.slice(-maxUnreadBatchSize),
        },
        { jitless: true },
      ),
      () => true,
    );
    return {
      baselineReads,
      canonicalReads,
      replayReads: state.reads - baselineReads - canonicalReads,
      replies,
      replay: replay?.reply,
    };
  } finally {
    subscription.dispose();
    unread.dispose();
  }
};
declare global {
  interface Window {
    __unreadBatchProbe: typeof runUnreadBatchProbe;
  }
}
window.__unreadBatchProbe = runUnreadBatchProbe;
