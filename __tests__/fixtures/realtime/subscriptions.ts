import {
  ackSchema,
  type PreparedSubscription,
} from "@insta/contracts/realtime";
import type { Command } from "../../../apps/fe-insta/src/lib/realtime/index";
/** Bounded wire fixture: задержки на command boundary, реальные FE owners включены. */
export const createSubscriptionServer = ({
  before = async () => {},
  after = async () => {},
}: Readonly<{
  before?: (command: Command) => Promise<void>;
  after?: (command: Command) => Promise<void>;
}> = {}) => {
  const slots = new Map<string, PreparedSubscription>();
  const commands: Command[] = [];
  let maxSlots = 0;
  const prepare = (
    value: Extract<
      Command,
      { type: "conversations.subscribe" | "conversations.unread.subscribe" }
    >,
    target: string,
  ) => {
    if (!slots.has(target) && slots.size >= 6)
      throw new Error("capacity exceeded");
    const prepared = slots.get(target) ?? {
      subscriptionId: crypto.randomUUID(),
      baseline: value.data.resume ?? {
        streamId: target,
        epoch: crypto.randomUUID(),
        cursor: 0,
      },
    };
    slots.set(target, prepared);
    maxSlots = Math.max(maxSlots, slots.size);
    return {
      ...prepared,
      ...(target === "#unread"
        ? { subscription: "unread" }
        : { conversationId: target }),
    };
  };
  const activate = (
    value: Extract<Command, { type: "conversations.activate" }>,
  ) => {
    const owner = [...slots.values()].find(
      (slot) => slot.subscriptionId === value.data.subscriptionId,
    );
    if (
      !owner ||
      JSON.stringify(owner.baseline) !== JSON.stringify(value.data.baseline)
    )
      throw new Error("activation mismatch");
    return owner;
  };
  const apply = (value: Command) => {
    const target =
      "conversationId" in value.data ? value.data.conversationId : "#unread";
    switch (value.type) {
      case "conversations.subscribe":
      case "conversations.unread.subscribe":
        return prepare(value, target);
      case "conversations.unsubscribe":
      case "conversations.unread.unsubscribe":
        slots.delete(target);
        return target === "#unread"
          ? { subscription: "unread", subscribed: false }
          : { conversationId: target };
      case "conversations.activate":
        return activate(value);
    }
  };
  const command = async (value: Command) => {
    commands.push(value);
    await before(value);
    const data = apply(value);
    await after(value);
    return ackSchema.parse(
      {
        version: 1,
        kind: "ack",
        ok: true,
        meta: {
          requestId: crypto.randomUUID(),
          ...(value.meta.operationId
            ? { operationId: value.meta.operationId }
            : {}),
        },
        data,
      },
      { jitless: true },
    );
  };
  return { command, commands, slots, maxSlots: () => maxSlots };
};
