import {
  realtimeCommandTypes,
  realtimeKinds,
  realtimeProtocolVersion,
  storiesFeedStream,
} from "@insta/contracts/realtime";
import type {
  RealtimeAck,
  RealtimeCommand,
} from "../../../../lib/realtime/index";
import { createFailureAck } from "../../../../lib/realtime/index";
import type { Recipient } from "./types";

const selectTarget = (
  recipient: Recipient,
  command: Extract<
    RealtimeCommand,
    {
      type:
        | "conversations.subscribe"
        | "conversations.unread.subscribe"
        | "stories.feed.subscribe";
    }
  >,
) => {
  switch (command.type) {
    case realtimeCommandTypes.subscribe:
      return { kind: "conversation" as const, id: command.data.conversationId };
    case realtimeCommandTypes.unreadSubscribe:
      return { kind: "unread" as const, id: recipient.actor.userId };
    case realtimeCommandTypes.storiesSubscribe:
      return storiesFeedStream;
  }
  return command satisfies never;
};
/** Готовит conversation/unread subscription с одной схемой результата. */
const prepare = async (
  recipient: Recipient,
  command: Extract<
    RealtimeCommand,
    {
      type:
        | "conversations.subscribe"
        | "conversations.unread.subscribe"
        | "stories.feed.subscribe";
    }
  >,
  meta: RealtimeAck["meta"],
  signal: AbortSignal,
): Promise<RealtimeAck> => {
  const conversation = command.type === realtimeCommandTypes.subscribe;
  const target = selectTarget(recipient, command);
  const result = await recipient.deliveries.prepare({
    target,
    ...(command.data.resume ? { after: command.data.resume } : {}),
    signal,
  });
  if (result.isError())
    return createFailureAck({
      code: result.getError(),
      message: "Subscription unavailable",
      meta,
    });
  const data = conversation
    ? { ...result.get(), conversationId: command.data.conversationId }
    : {
        ...result.get(),
        subscription:
          command.type === realtimeCommandTypes.storiesSubscribe
            ? ("stories" as const)
            : ("unread" as const),
      };
  return {
    version: realtimeProtocolVersion,
    kind: realtimeKinds.ack,
    ok: true,
    meta,
    data,
  };
};
/** Отображает результаты subscription owner в command ACK; remove ждёт освобождения slot. */
export const executeSubscription = async ({
  recipient,
  command,
  meta,
  signal,
}: Readonly<{
  recipient: Recipient;
  command: RealtimeCommand;
  meta: RealtimeAck["meta"];
  signal: AbortSignal;
}>): Promise<RealtimeAck> => {
  const base = {
    version: realtimeProtocolVersion,
    kind: realtimeKinds.ack,
    ok: true as const,
    meta,
  } as const;
  switch (command.type) {
    case realtimeCommandTypes.subscribe:
    case realtimeCommandTypes.unreadSubscribe:
    case realtimeCommandTypes.storiesSubscribe:
      return prepare(recipient, command, meta, signal);
    case realtimeCommandTypes.activate: {
      const result = await recipient.deliveries.activate({
        ...command.data,
        signal,
      });
      return result.isError()
        ? createFailureAck({
            code: result.getError(),
            message: "Subscription unavailable",
            meta,
          })
        : { ...base, data: command.data };
    }
    case realtimeCommandTypes.unsubscribe:
      await recipient.deliveries.remove({
        kind: "conversation",
        id: command.data.conversationId,
      });
      return { ...base, data: command.data };
    case realtimeCommandTypes.storiesUnsubscribe:
      await recipient.deliveries.remove(storiesFeedStream);
      return { ...base, data: { subscription: "stories", subscribed: false } };
    case realtimeCommandTypes.unreadUnsubscribe:
      await recipient.deliveries.remove({
        kind: "unread",
        id: recipient.actor.userId,
      });
      return { ...base, data: { subscription: "unread", subscribed: false } };
    default:
      return command satisfies never;
  }
};
